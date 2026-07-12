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
});

/** Next sequential AF-#### tag, allocated atomically inside the caller's transaction. */
async function nextAssetTag(conn) {
  const [[counter]] = await conn.query(
    `SELECT next_value FROM tag_counters WHERE name = 'asset_tag' FOR UPDATE`
  );
  await conn.query(`UPDATE tag_counters SET next_value = next_value + 1 WHERE name = 'asset_tag'`);
  return `AF-${String(counter.next_value).padStart(4, '0')}`;
}

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
                             cond, location, department_id, is_bookable, custom_field_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tag, b.name, b.category_id, b.serial_number ?? null, b.acquisition_date ?? null,
         b.acquisition_cost ?? null, b.cond, b.location ?? null, b.department_id ?? null,
         b.is_bookable ? 1 : 0, b.custom_field_values ? JSON.stringify(b.custom_field_values) : null]
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
    for (const f of ['name', 'category_id', 'serial_number', 'acquisition_date', 'acquisition_cost', 'cond', 'location', 'department_id']) {
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
