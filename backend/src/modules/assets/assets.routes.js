import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { pool, withTransaction } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { assertTransition, pretty } from '../../utils/stateMachine.js';
import { paged, meta } from '../../utils/pagination.js';
import { config } from '../../config.js';
import { invalidateKpis } from '../../utils/notify.js';

const router = Router();
router.use(requireAuth);

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR'];
const STATUSES = ['AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED'];

fs.mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new ApiError(400, 'BAD_FILE_TYPE', 'Only PNG, JPG, WEBP images or PDF documents are allowed.'), ok);
  },
});

const assetBody = z.object({
  name: z.string().trim().min(2, 'Asset name must be at least 2 characters').max(160),
  category_id: z.coerce.number().int().positive('Pick a category'),
  serial_number: z.string().trim().max(120).nullable().optional(),
  acquisition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  acquisition_cost: z.coerce.number().min(0, 'Cost cannot be negative').max(999999999).nullable().optional(),
  cond: z.enum(CONDITIONS).default('GOOD'),
  location: z.string().trim().max(160).nullable().optional(),
  department_id: z.coerce.number().int().positive().nullable().optional(),
  is_bookable: z.coerce.boolean().default(false),
  custom_field_values: z.record(z.union([z.string(), z.number()])).nullable().optional(),
  useful_life_years: z.coerce.number().int().min(1).max(50).nullable().optional(),
});

/** Next sequential AF-#### tag, allocated atomically inside the caller's transaction. */
async function nextAssetTag(conn) {
  const [[counter]] = await conn.query(
    `SELECT next_value FROM tag_counters WHERE name = 'asset_tag' FOR UPDATE`
  );
  await conn.query(`UPDATE tag_counters SET next_value = next_value + 1 WHERE name = 'asset_tag'`);
  return `AF-${String(counter.next_value).padStart(4, '0')}`;
}

/** Reserves `count` sequential AF-#### tags in one lock/update round trip
 * (vs. calling nextAssetTag per row) — returns the first reserved value;
 * row i gets `AF-${pad(start + i)}`. Must only be called with the count of
 * rows that have already passed validation, so a failed row never consumes
 * a tag number and never creates a gap. */
async function reserveAssetTags(conn, count) {
  const [[counter]] = await conn.query(
    `SELECT next_value FROM tag_counters WHERE name = 'asset_tag' FOR UPDATE`
  );
  await conn.query(`UPDATE tag_counters SET next_value = next_value + ? WHERE name = 'asset_tag'`, [count]);
  return counter.next_value;
}

const bulkRowSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category_name: z.string().trim().min(1).max(120),
  serial_number: z.string().trim().max(120).nullable().optional(),
  acquisition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  acquisition_cost: z.coerce.number().min(0).max(999999999).nullable().optional(),
  cond: z.enum(CONDITIONS).default('GOOD'),
  location: z.string().trim().max(160).nullable().optional(),
  department_name: z.string().trim().max(120).nullable().optional(),
  is_bookable: z.coerce.boolean().default(false),
});
const bulkImportBody = z.object({
  rows: z.array(bulkRowSchema).min(1, 'At least one row required').max(500, 'Maximum 500 rows per import'),
});

// ---------- list & search ----------
router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];

    if (req.query.search) {
      // Matches tag, serial, name — and QR payloads, which encode the tag.
      filters.push('(a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.name LIKE ?)');
      const s = `%${req.query.search}%`;
      vals.push(s, s, s);
    }
    if (req.query.category_id) { filters.push('a.category_id = ?'); vals.push(Number(req.query.category_id)); }
    if (req.query.status && STATUSES.includes(req.query.status)) { filters.push('a.status = ?'); vals.push(req.query.status); }
    if (req.query.department_id) { filters.push('a.department_id = ?'); vals.push(Number(req.query.department_id)); }
    if (req.query.location) { filters.push('a.location LIKE ?'); vals.push(`%${req.query.location}%`); }
    if (req.query.bookable === 'true') filters.push('a.is_bookable = 1');

    // Department Heads see their department's assets plus unassigned pool.
    if (req.user.role === 'DEPT_HEAD' && req.query.all !== 'true') {
      filters.push('(a.department_id = ? OR a.department_id IS NULL)');
      vals.push(req.user.department_id);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM assets a ${where}`, vals);
    const [rows] = await pool.query(
      `SELECT a.*, c.name AS category_name, d.name AS department_name,
              al.allocated_to_user_id, hu.name AS holder_name
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN allocations al ON al.asset_id = a.id AND al.returned_at IS NULL
       LEFT JOIN users hu ON hu.id = al.allocated_to_user_id
       ${where} ORDER BY a.asset_tag DESC LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

// ---------- lookup by tag (QR scan) ----------
router.get(
  '/by-tag/:tag',
  validate({ params: z.object({ tag: z.string().trim().min(1).max(20) }) }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT a.*, c.name AS category_name, d.name AS department_name
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.asset_tag = ?`,
      [req.params.tag]
    );
    const asset = rows[0];
    if (!asset) throw ApiError.notFound('No asset found for this tag.');

    const [allocations] = await pool.query(
      `SELECT al.* FROM allocations al WHERE al.asset_id = ? AND al.returned_at IS NULL LIMIT 1`,
      [asset.id]
    );
    res.json({ data: { ...asset, active_allocation: allocations[0] ?? null } });
  })
);

// ---------- register ----------
router.post(
  '/',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({ body: assetBody }),
  catchAsync(async (req, res) => {
    const b = req.body;
    const [cat] = await pool.query(`SELECT id FROM asset_categories WHERE id = ? AND status = 'ACTIVE'`, [b.category_id]);
    if (!cat.length) throw ApiError.badRequest('Selected category does not exist or is inactive.');

    if (b.serial_number) {
      const [dupe] = await pool.query('SELECT asset_tag FROM assets WHERE serial_number = ?', [b.serial_number]);
      if (dupe.length) {
        throw ApiError.conflict('DUPLICATE_SERIAL', `Serial number already registered on ${dupe[0].asset_tag}.`);
      }
    }

    const created = await withTransaction(async (conn) => {
      const tag = await nextAssetTag(conn);
      const [result] = await conn.query(
        `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost,
                             cond, location, department_id, is_bookable, custom_field_values, useful_life_years)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tag, b.name, b.category_id, b.serial_number ?? null, b.acquisition_date ?? null,
         b.acquisition_cost ?? null, b.cond, b.location ?? null, b.department_id ?? null,
         b.is_bookable ? 1 : 0, b.custom_field_values ? JSON.stringify(b.custom_field_values) : null,
         b.useful_life_years ?? null]
      );
      await logActivity({
        actorId: req.user.id, action: 'ASSET_REGISTERED', entityType: 'asset', entityId: result.insertId,
        summary: `${tag} "${b.name}" registered as Available`,
      }, conn);
      return { id: result.insertId, asset_tag: tag };
    });

    invalidateKpis();
    res.status(201).json({ data: created });
  })
);

// ---------- bulk CSV import ----------
// Category/department names are resolved server-side (single source of
// truth); tag numbers are reserved in one block only for rows that already
// passed validation, so a bad row never consumes a tag or creates a gap.
router.post(
  '/bulk-import',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({ body: bulkImportBody }),
  catchAsync(async (req, res) => {
    const results = await withTransaction(async (conn) => {
      const [cats] = await conn.query(`SELECT id, name FROM asset_categories WHERE status = 'ACTIVE'`);
      const [depts] = await conn.query(`SELECT id, name FROM departments WHERE status = 'ACTIVE'`);
      const catMap = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
      const deptMap = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));

      const out = new Array(req.body.rows.length).fill(null);
      const seenSerials = new Set();
      const validRows = [];

      for (let i = 0; i < req.body.rows.length; i++) {
        const row = req.body.rows[i];
        const rowNum = i + 1;

        const category_id = catMap.get(row.category_name.trim().toLowerCase());
        if (!category_id) { out[i] = { row: rowNum, success: false, error: `Unknown category '${row.category_name}'` }; continue; }

        let department_id = null;
        if (row.department_name) {
          department_id = deptMap.get(row.department_name.trim().toLowerCase());
          if (!department_id) { out[i] = { row: rowNum, success: false, error: `Unknown department '${row.department_name}'` }; continue; }
        }

        if (row.serial_number) {
          if (seenSerials.has(row.serial_number)) {
            out[i] = { row: rowNum, success: false, error: `Duplicate serial '${row.serial_number}' in this file` };
            continue;
          }
          const [dupe] = await conn.query('SELECT asset_tag FROM assets WHERE serial_number = ?', [row.serial_number]);
          if (dupe.length) {
            out[i] = { row: rowNum, success: false, error: `Serial already registered on ${dupe[0].asset_tag}` };
            continue;
          }
          seenSerials.add(row.serial_number);
        }

        validRows.push({ rowIndex: i, rowNum, row, category_id, department_id });
      }

      if (validRows.length) {
        const startTag = await reserveAssetTags(conn, validRows.length);
        for (let j = 0; j < validRows.length; j++) {
          const { rowIndex, rowNum, row, category_id, department_id } = validRows[j];
          const tag = `AF-${String(startTag + j).padStart(4, '0')}`;
          const [result] = await conn.query(
            `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost,
                                 cond, location, department_id, is_bookable)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tag, row.name, category_id, row.serial_number ?? null, row.acquisition_date ?? null,
             row.acquisition_cost ?? null, row.cond, row.location ?? null, department_id, row.is_bookable ? 1 : 0]
          );
          out[rowIndex] = { row: rowNum, success: true, id: result.insertId, asset_tag: tag };
        }
        await logActivity({
          actorId: req.user.id, action: 'ASSET_BULK_IMPORTED', entityType: 'asset', entityId: null,
          summary: `${validRows.length} asset(s) bulk-imported (${out.length - validRows.length} row error(s))`,
        }, conn);
      }

      return out;
    });

    invalidateKpis();
    res.json({
      data: {
        total: results.length,
        imported: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
    });
  })
);

// ---------- detail with history ----------
router.get(
  '/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT a.*, c.name AS category_name, c.custom_fields AS category_custom_fields, d.name AS department_name
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.id = ?`,
      [req.params.id]
    );
    const asset = rows[0];
    if (!asset) throw ApiError.notFound('Asset not found.');

    const [allocations] = await pool.query(
      `SELECT al.*, u.name AS holder_name, dd.name AS holder_department, ab.name AS allocated_by_name
       FROM allocations al
       LEFT JOIN users u ON u.id = al.allocated_to_user_id
       LEFT JOIN departments dd ON dd.id = al.allocated_to_department_id
       LEFT JOIN users ab ON ab.id = al.allocated_by
       WHERE al.asset_id = ? ORDER BY al.allocated_at DESC`,
      [asset.id]
    );
    const [maintenance] = await pool.query(
      `SELECT m.*, ru.name AS raised_by_name FROM maintenance_requests m
       JOIN users ru ON ru.id = m.raised_by
       WHERE m.asset_id = ? ORDER BY m.created_at DESC`,
      [asset.id]
    );
    const [files] = await pool.query('SELECT * FROM asset_files WHERE asset_id = ? ORDER BY created_at DESC', [asset.id]);
    const [bookings] = await pool.query(
      `SELECT b.*, u.name AS booked_by_name FROM bookings b JOIN users u ON u.id = b.booked_by
       WHERE b.asset_id = ? AND b.status IN ('UPCOMING','ONGOING') ORDER BY b.starts_at LIMIT 10`,
      [asset.id]
    );
    res.json({ data: { ...asset, allocations, maintenance, files, upcoming_bookings: bookings } });
  })
);

// ---------- update basic fields ----------
router.patch(
  '/:id',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }), body: assetBody.partial() }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    const asset = rows[0];
    if (!asset) throw ApiError.notFound('Asset not found.');

    const sets = [];
    const vals = [];
    for (const f of ['name', 'category_id', 'serial_number', 'acquisition_date', 'acquisition_cost', 'cond', 'location', 'department_id', 'useful_life_years']) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (req.body.is_bookable !== undefined) { sets.push('is_bookable = ?'); vals.push(req.body.is_bookable ? 1 : 0); }
    if (req.body.custom_field_values !== undefined) {
      sets.push('custom_field_values = ?');
      vals.push(req.body.custom_field_values ? JSON.stringify(req.body.custom_field_values) : null);
    }
    if (!sets.length) throw ApiError.badRequest('Nothing to update.');

    await pool.query(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    await logActivity({
      actorId: req.user.id, action: 'ASSET_UPDATED', entityType: 'asset', entityId: asset.id,
      summary: `${asset.asset_tag} details updated`, metadata: req.body,
    });
    res.json({ data: { id: asset.id } });
  })
);

// ---------- manual lifecycle transition (retire / dispose / mark found) ----------
router.patch(
  '/:id/status',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ status: z.enum(STATUSES), note: z.string().trim().max(300).optional() }),
  }),
  catchAsync(async (req, res) => {
    const { status: to, note } = req.body;
    await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM assets WHERE id = ? FOR UPDATE', [req.params.id]);
      const asset = rows[0];
      if (!asset) throw ApiError.notFound('Asset not found.');

      // Allocation/return/maintenance flows have dedicated endpoints; this one
      // is for administrative moves only.
      if (['ALLOCATED', 'UNDER_MAINTENANCE'].includes(to)) {
        throw ApiError.badRequest(`Use the ${to === 'ALLOCATED' ? 'allocation' : 'maintenance'} workflow to move an asset to ${pretty(to)}.`);
      }
      assertTransition(asset.status, to);

      await conn.query('UPDATE assets SET status = ? WHERE id = ?', [to, asset.id]);
      await logActivity({
        actorId: req.user.id, action: 'ASSET_STATUS_CHANGED', entityType: 'asset', entityId: asset.id,
        summary: `${asset.asset_tag}: ${pretty(asset.status)} → ${pretty(to)}${note ? ` — ${note}` : ''}`,
        metadata: { from: asset.status, to, note },
      }, conn);
    });
    invalidateKpis();
    res.json({ data: { id: Number(req.params.id), status: to } });
  })
);

// ---------- files ----------
router.post(
  '/:id/files',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  upload.array('files', 5),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query('SELECT id, asset_tag FROM assets WHERE id = ?', [req.params.id]);
    if (!rows.length) throw ApiError.notFound('Asset not found.');
    if (!req.files?.length) throw ApiError.badRequest('Attach at least one file.');

    for (const f of req.files) {
      await pool.query(
        'INSERT INTO asset_files (asset_id, file_path, original_name, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, f.filename, f.originalname, f.mimetype, req.user.id]
      );
    }
    await logActivity({
      actorId: req.user.id, action: 'ASSET_FILES_ADDED', entityType: 'asset', entityId: Number(req.params.id),
      summary: `${req.files.length} file(s) attached to ${rows[0].asset_tag}`,
    });
    res.status(201).json({ data: { count: req.files.length } });
  })
);

// Authenticated file serving (uploads dir is not exposed statically).
router.get(
  '/files/:fileId',
  validate({ params: z.object({ fileId: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM asset_files WHERE id = ?', [req.params.fileId]);
    const file = rows[0];
    if (!file) throw ApiError.notFound('File not found.');
    res.sendFile(path.join(config.uploadsDir, file.file_path));
  })
);

export default router;
