import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import multer from 'multer';
import { pool, withTransaction } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { notify, notifyRole, invalidateKpis } from '../../utils/notify.js';
import { assertTransition } from '../../utils/stateMachine.js';
import { paged, meta } from '../../utils/pagination.js';
import { config } from '../../config.js';

const router = Router();
router.use(requireAuth);

// The "attach photo of the issue" upload on raise-request. Mirrors the
// asset-files upload config in assets.routes.js.
fs.mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new ApiError(400, 'BAD_FILE_TYPE', 'Only PNG, JPG, or WEBP images are allowed.'), ok);
  },
});

router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];
    if (req.query.status) { filters.push('m.status = ?'); vals.push(req.query.status); }
    if (req.query.asset_id) { filters.push('m.asset_id = ?'); vals.push(Number(req.query.asset_id)); }
    if (req.user.role === 'EMPLOYEE') { filters.push('m.raised_by = ?'); vals.push(req.user.id); }
    else if (req.user.role === 'DEPT_HEAD') {
      filters.push('(a.department_id = ? OR m.raised_by = ?)');
      vals.push(req.user.department_id, req.user.id);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const base = `FROM maintenance_requests m
      JOIN assets a ON a.id = m.asset_id
      JOIN users ru ON ru.id = m.raised_by ${where}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, vals);
    const [rows] = await pool.query(
      `SELECT m.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status, ru.name AS raised_by_name
       ${base} ORDER BY FIELD(m.priority,'CRITICAL','HIGH','MEDIUM','LOW'), m.created_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

// Raise a request. Crucially: this NEVER touches the asset's status.
router.post(
  '/',
  upload.single('photo'),
  validate({
    body: z.object({
      asset_id: z.coerce.number().int().positive('Pick an asset'),
      issue_description: z.string().trim().min(5, 'Describe the issue (at least 5 characters)').max(1000),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    }),
  }),
  catchAsync(async (req, res) => {
    const b = req.body;
    const [assetRows] = await pool.query('SELECT * FROM assets WHERE id = ?', [b.asset_id]);
    const asset = assetRows[0];
    if (!asset) throw ApiError.notFound('Asset not found.');
    if (['LOST', 'RETIRED', 'DISPOSED'].includes(asset.status)) {
      throw ApiError.conflict('ASSET_OUT_OF_SERVICE', `${asset.asset_tag} is ${asset.status.toLowerCase()} — maintenance does not apply.`);
    }
    if (asset.status === 'UNDER_MAINTENANCE') {
      throw ApiError.conflict('ALREADY_IN_MAINTENANCE', `${asset.asset_tag} is already under maintenance.`);
    }
    const [open] = await pool.query(
      `SELECT id FROM maintenance_requests WHERE asset_id = ? AND status IN ('PENDING','APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS')`,
      [b.asset_id]
    );
    if (open.length) {
      throw ApiError.conflict('REQUEST_EXISTS', 'An open maintenance request already exists for this asset.');
    }

    const [result] = await pool.query(
      `INSERT INTO maintenance_requests (asset_id, raised_by, issue_description, priority, photo_path) VALUES (?, ?, ?, ?, ?)`,
      [b.asset_id, req.user.id, b.issue_description, b.priority, req.file?.filename ?? null]
    );
    await logActivity({
      actorId: req.user.id, action: 'MAINTENANCE_RAISED', entityType: 'maintenance', entityId: result.insertId,
      summary: `${asset.asset_tag}: maintenance raised (${b.priority.toLowerCase()}) — awaiting approval`,
    });
    await notifyRole(['ASSET_MANAGER', 'ADMIN'], {
      type: 'MAINTENANCE_RAISED',
      title: `Maintenance request: ${asset.asset_tag} ${asset.name}`,
      body: `${b.priority} priority — ${b.issue_description.slice(0, 120)}`,
      entityType: 'maintenance', entityId: result.insertId,
    });
    invalidateKpis();
    res.status(201).json({ data: { id: result.insertId, status: 'PENDING' } });
  })
);

// Approval is the ONLY door into Under Maintenance.
router.post(
  '/:id/approve',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ notes: z.string().trim().max(500).optional() }).optional().default({}),
  }),
  catchAsync(async (req, res) => {
    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT m.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status
         FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
         WHERE m.id = ? FOR UPDATE`,
        [req.params.id]
      );
      const m = rows[0];
      if (!m) throw ApiError.notFound('Maintenance request not found.');
      if (m.status !== 'PENDING') throw ApiError.conflict('ALREADY_DECIDED', `This request is already ${m.status.toLowerCase()}.`);

      await conn.query('SELECT id FROM assets WHERE id = ? FOR UPDATE', [m.asset_id]);
      assertTransition(m.asset_status, 'UNDER_MAINTENANCE');

      await conn.query(
        `UPDATE maintenance_requests
         SET status = 'APPROVED', decided_by = ?, decided_at = NOW(), decision_notes = ?, previous_asset_status = ?
         WHERE id = ?`,
        [req.user.id, req.body?.notes ?? null, m.asset_status, m.id]
      );
      await conn.query(`UPDATE assets SET status = 'UNDER_MAINTENANCE' WHERE id = ?`, [m.asset_id]);

      await logActivity({
        actorId: req.user.id, action: 'MAINTENANCE_APPROVED', entityType: 'maintenance', entityId: m.id,
        summary: `${m.asset_tag}: maintenance approved — asset now Under Maintenance`,
      }, conn);
      await notify(m.raised_by, {
        type: 'MAINTENANCE_APPROVED',
        title: `Maintenance approved: ${m.asset_tag} ${m.asset_name}`,
        body: `Approved by ${req.user.name}`,
        entityType: 'maintenance', entityId: m.id,
      }, conn);
    });
    invalidateKpis();
    res.json({ data: { id: Number(req.params.id), status: 'APPROVED' } });
  })
);

router.post(
  '/:id/reject',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ notes: z.string().trim().min(3, 'Give the requester a reason').max(500) }),
  }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT m.*, a.asset_tag, a.name AS asset_name FROM maintenance_requests m
       JOIN assets a ON a.id = m.asset_id WHERE m.id = ?`,
      [req.params.id]
    );
    const m = rows[0];
    if (!m) throw ApiError.notFound('Maintenance request not found.');
    if (m.status !== 'PENDING') throw ApiError.conflict('ALREADY_DECIDED', `This request is already ${m.status.toLowerCase()}.`);

    await pool.query(
      `UPDATE maintenance_requests SET status = 'REJECTED', decided_by = ?, decided_at = NOW(), decision_notes = ? WHERE id = ?`,
      [req.user.id, req.body.notes, m.id]
    );
    await logActivity({
      actorId: req.user.id, action: 'MAINTENANCE_REJECTED', entityType: 'maintenance', entityId: m.id,
      summary: `${m.asset_tag}: maintenance rejected — ${req.body.notes}`,
    });
    await notify(m.raised_by, {
      type: 'MAINTENANCE_REJECTED',
      title: `Maintenance rejected: ${m.asset_tag} ${m.asset_name}`,
      body: req.body.notes,
      entityType: 'maintenance', entityId: m.id,
    });
    invalidateKpis();
    res.json({ data: { id: m.id, status: 'REJECTED' } });
  })
);

router.post(
  '/:id/assign-technician',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ technician_name: z.string().trim().min(2, 'Technician name required').max(120) }),
  }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM maintenance_requests WHERE id = ?', [req.params.id]);
    const m = rows[0];
    if (!m) throw ApiError.notFound('Maintenance request not found.');
    if (m.status !== 'APPROVED') {
      throw ApiError.conflict('WRONG_STAGE', 'A technician can only be assigned to an approved request.');
    }
    await pool.query(
      `UPDATE maintenance_requests SET status = 'TECHNICIAN_ASSIGNED', technician_name = ? WHERE id = ?`,
      [req.body.technician_name, m.id]
    );
    await logActivity({
      actorId: req.user.id, action: 'TECHNICIAN_ASSIGNED', entityType: 'maintenance', entityId: m.id,
      summary: `Technician ${req.body.technician_name} assigned to request #${m.id}`,
    });
    res.json({ data: { id: m.id, status: 'TECHNICIAN_ASSIGNED' } });
  })
);

router.post(
  '/:id/start',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM maintenance_requests WHERE id = ?', [req.params.id]);
    const m = rows[0];
    if (!m) throw ApiError.notFound('Maintenance request not found.');
    if (m.status !== 'TECHNICIAN_ASSIGNED') {
      throw ApiError.conflict('WRONG_STAGE', 'Work can only start after a technician is assigned.');
    }
    await pool.query(`UPDATE maintenance_requests SET status = 'IN_PROGRESS' WHERE id = ?`, [m.id]);
    await logActivity({
      actorId: req.user.id, action: 'MAINTENANCE_STARTED', entityType: 'maintenance', entityId: m.id,
      summary: `Repair work started on request #${m.id}`,
    });
    res.json({ data: { id: m.id, status: 'IN_PROGRESS' } });
  })
);

// Resolution flips the asset back to what it was before (Available or Allocated).
router.post(
  '/:id/resolve',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ resolution_notes: z.string().trim().min(3, 'Add resolution notes').max(1000) }),
  }),
  catchAsync(async (req, res) => {
    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT m.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status
         FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
         WHERE m.id = ? FOR UPDATE`,
        [req.params.id]
      );
      const m = rows[0];
      if (!m) throw ApiError.notFound('Maintenance request not found.');
      if (!['IN_PROGRESS', 'TECHNICIAN_ASSIGNED', 'APPROVED'].includes(m.status)) {
        throw ApiError.conflict('WRONG_STAGE', `A ${m.status.toLowerCase()} request cannot be resolved.`);
      }

      await conn.query('SELECT id FROM assets WHERE id = ? FOR UPDATE', [m.asset_id]);
      // If it was held when maintenance began AND that holder still has the
      // open allocation, restore ALLOCATED; otherwise back to AVAILABLE.
      let restoreTo = 'AVAILABLE';
      if (m.previous_asset_status === 'ALLOCATED') {
        const [active] = await conn.query(
          'SELECT id FROM allocations WHERE asset_id = ? AND returned_at IS NULL',
          [m.asset_id]
        );
        if (active.length) restoreTo = 'ALLOCATED';
      }
      assertTransition(m.asset_status, restoreTo);

      await conn.query(
        `UPDATE maintenance_requests SET status = 'RESOLVED', resolution_notes = ?, resolved_at = NOW() WHERE id = ?`,
        [req.body.resolution_notes, m.id]
      );
      await conn.query('UPDATE assets SET status = ? WHERE id = ?', [restoreTo, m.asset_id]);

      await logActivity({
        actorId: req.user.id, action: 'MAINTENANCE_RESOLVED', entityType: 'maintenance', entityId: m.id,
        summary: `${m.asset_tag}: maintenance resolved — asset back to ${restoreTo.toLowerCase()}`,
      }, conn);
      await notify(m.raised_by, {
        type: 'MAINTENANCE_RESOLVED',
        title: `Maintenance resolved: ${m.asset_tag} ${m.asset_name}`,
        body: req.body.resolution_notes.slice(0, 200),
        entityType: 'maintenance', entityId: m.id,
      }, conn);
    });
    invalidateKpis();
    res.json({ data: { id: Number(req.params.id), status: 'RESOLVED' } });
  })
);

export default router;
