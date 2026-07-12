import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { notify, invalidateKpis } from '../../utils/notify.js';
import { paged, meta } from '../../utils/pagination.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];
    if (req.query.status) { filters.push('t.status = ?'); vals.push(req.query.status); }

    if (req.user.role === 'EMPLOYEE') {
      filters.push('(t.requested_by = ? OR t.from_user_id = ? OR t.to_user_id = ?)');
      vals.push(req.user.id, req.user.id, req.user.id);
    } else if (req.user.role === 'DEPT_HEAD') {
      filters.push(`(t.to_department_id = ? OR fu.department_id = ? OR tu.department_id = ? OR t.requested_by = ?)`);
      vals.push(req.user.department_id, req.user.department_id, req.user.department_id, req.user.id);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const base = `FROM transfer_requests t
      JOIN assets a ON a.id = t.asset_id
      LEFT JOIN users fu ON fu.id = t.from_user_id
      LEFT JOIN users tu ON tu.id = t.to_user_id
      LEFT JOIN departments td ON td.id = t.to_department_id
      LEFT JOIN users rb ON rb.id = t.requested_by ${where}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, vals);
    const [rows] = await pool.query(
      `SELECT t.*, a.asset_tag, a.name AS asset_name,
              fu.name AS from_user_name, tu.name AS to_user_name,
              td.name AS to_department_name, rb.name AS requested_by_name
       ${base} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

// Anyone can raise a transfer request (that's the redirect from a blocked allocation).
router.post(
  '/',
  validate({
    body: z
      .object({
        asset_id: z.coerce.number().int().positive(),
        to_user_id: z.coerce.number().int().positive().nullable().optional(),
        to_department_id: z.coerce.number().int().positive().nullable().optional(),
        reason: z.string().trim().min(3, 'Give a short reason').max(500),
      })
      .refine((b) => b.to_user_id || b.to_department_id, {
        message: 'Choose a target employee or department.',
        path: ['to_user_id'],
      }),
  }),
  catchAsync(async (req, res) => {
    const b = req.body;
    const [assetRows] = await pool.query('SELECT * FROM assets WHERE id = ?', [b.asset_id]);
    const asset = assetRows[0];
    if (!asset) throw ApiError.notFound('Asset not found.');

    const [activeAlloc] = await pool.query(
      `SELECT al.*, u.name AS holder_name FROM allocations al
       LEFT JOIN users u ON u.id = al.allocated_to_user_id
       WHERE al.asset_id = ? AND al.returned_at IS NULL`,
      [b.asset_id]
    );
    if (!activeAlloc.length) {
      throw ApiError.conflict('NOT_ALLOCATED', `${asset.asset_tag} is not currently allocated — you can allocate it directly.`);
    }
    if (activeAlloc[0].allocated_to_user_id && activeAlloc[0].allocated_to_user_id === b.to_user_id) {
      throw ApiError.badRequest('That employee already holds this asset.');
    }

    const [pending] = await pool.query(
      `SELECT id FROM transfer_requests WHERE asset_id = ? AND status = 'REQUESTED'`,
      [b.asset_id]
    );
    if (pending.length) {
      throw ApiError.conflict('TRANSFER_PENDING', 'A transfer request for this asset is already awaiting a decision.');
    }

    const [result] = await pool.query(
      `INSERT INTO transfer_requests (asset_id, from_user_id, to_user_id, to_department_id, reason, requested_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [b.asset_id, activeAlloc[0].allocated_to_user_id, b.to_user_id ?? null, b.to_department_id ?? null, b.reason, req.user.id]
    );
    await logActivity({
      actorId: req.user.id, action: 'TRANSFER_REQUESTED', entityType: 'transfer', entityId: result.insertId,
      summary: `Transfer requested for ${asset.asset_tag}`,
      metadata: b,
    });
    // Alert approvers.
    const [managers] = await pool.query(
      `SELECT id FROM users WHERE role IN ('ASSET_MANAGER','ADMIN') AND status='ACTIVE'`
    );
    for (const m of managers) {
      await notify(m.id, {
        type: 'TRANSFER_REQUESTED',
        title: `Transfer request: ${asset.asset_tag} ${asset.name}`,
        body: `Requested by ${req.user.name} — ${b.reason}`,
        entityType: 'transfer', entityId: result.insertId,
      });
    }
    invalidateKpis();
    res.status(201).json({ data: { id: result.insertId } });
  })
);

const decisionGuard = (req, transfer) => {
  // Asset Managers/Admins approve anything; a Department Head may approve
  // transfers targeting their own department.
  if (['ADMIN', 'ASSET_MANAGER'].includes(req.user.role)) return;
  if (req.user.role === 'DEPT_HEAD' && transfer.to_department_id === req.user.department_id) return;
  throw ApiError.forbidden('Only Asset Managers (or the target Department Head) can decide transfer requests.');
};

// Approve: re-allocates atomically — close old allocation, open new one.
router.post(
  '/:id/approve',
  requireRole('ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ notes: z.string().trim().max(500).optional() }).optional().default({}),
  }),
  catchAsync(async (req, res) => {
    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT t.*, a.asset_tag, a.name AS asset_name FROM transfer_requests t
         JOIN assets a ON a.id = t.asset_id WHERE t.id = ? FOR UPDATE`,
        [req.params.id]
      );
      const t = rows[0];
      if (!t) throw ApiError.notFound('Transfer request not found.');
      if (t.status !== 'REQUESTED') {
        throw ApiError.conflict('ALREADY_DECIDED', `This request was already ${t.status.toLowerCase()}.`);
      }
      decisionGuard(req, t);

      // Lock the asset and close its active allocation.
      await conn.query('SELECT id FROM assets WHERE id = ? FOR UPDATE', [t.asset_id]);
      const [active] = await conn.query(
        'SELECT * FROM allocations WHERE asset_id = ? AND returned_at IS NULL FOR UPDATE',
        [t.asset_id]
      );
      if (active.length) {
        await conn.query(
          `UPDATE allocations SET returned_at = NOW(), return_condition_notes = 'Closed by approved transfer', returned_to = ? WHERE id = ?`,
          [req.user.id, active[0].id]
        );
      }
      await conn.query(
        `INSERT INTO allocations (asset_id, allocated_to_user_id, allocated_to_department_id, allocated_by, expected_return_date)
         VALUES (?, ?, ?, ?, ?)`,
        [t.asset_id, t.to_user_id, t.to_department_id, req.user.id, active[0]?.expected_return_date ?? null]
      );
      await conn.query(`UPDATE assets SET status = 'ALLOCATED' WHERE id = ?`, [t.asset_id]);
      await conn.query(
        `UPDATE transfer_requests SET status = 'COMPLETED', decided_by = ?, decided_at = NOW(), decision_notes = ? WHERE id = ?`,
        [req.user.id, req.body?.notes ?? null, t.id]
      );

      await logActivity({
        actorId: req.user.id, action: 'TRANSFER_APPROVED', entityType: 'transfer', entityId: t.id,
        summary: `Transfer of ${t.asset_tag} approved and re-allocated`,
      }, conn);

      for (const uid of [t.requested_by, t.from_user_id, t.to_user_id]) {
        await notify(uid, {
          type: 'TRANSFER_APPROVED',
          title: `Transfer approved: ${t.asset_tag} ${t.asset_name}`,
          body: `Approved by ${req.user.name}`,
          entityType: 'transfer', entityId: t.id,
        }, conn);
      }
    });
    invalidateKpis();
    res.json({ data: { id: Number(req.params.id), status: 'COMPLETED' } });
  })
);

router.post(
  '/:id/reject',
  requireRole('ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ notes: z.string().trim().min(3, 'Give the requester a reason').max(500) }),
  }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT t.*, a.asset_tag, a.name AS asset_name FROM transfer_requests t
       JOIN assets a ON a.id = t.asset_id WHERE t.id = ?`,
      [req.params.id]
    );
    const t = rows[0];
    if (!t) throw ApiError.notFound('Transfer request not found.');
    if (t.status !== 'REQUESTED') throw ApiError.conflict('ALREADY_DECIDED', `This request was already ${t.status.toLowerCase()}.`);
    decisionGuard(req, t);

    await pool.query(
      `UPDATE transfer_requests SET status = 'REJECTED', decided_by = ?, decided_at = NOW(), decision_notes = ? WHERE id = ?`,
      [req.user.id, req.body.notes, t.id]
    );
    await logActivity({
      actorId: req.user.id, action: 'TRANSFER_REJECTED', entityType: 'transfer', entityId: t.id,
      summary: `Transfer of ${t.asset_tag} rejected — ${req.body.notes}`,
    });
    await notify(t.requested_by, {
      type: 'TRANSFER_REJECTED',
      title: `Transfer rejected: ${t.asset_tag} ${t.asset_name}`,
      body: req.body.notes,
      entityType: 'transfer', entityId: t.id,
    });
    invalidateKpis();
    res.json({ data: { id: t.id, status: 'REJECTED' } });
  })
);

export default router;
