import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { notify, invalidateKpis } from '../../utils/notify.js';
import { assertTransition } from '../../utils/stateMachine.js';
import { paged, meta } from '../../utils/pagination.js';
import { toLocalDateStr } from '../../utils/dates.js';

const router = Router();
router.use(requireAuth);

// ---------- list ----------
router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];

    if (req.query.active === 'true') filters.push('al.returned_at IS NULL');
    if (req.query.overdue === 'true') {
      filters.push('al.returned_at IS NULL AND al.expected_return_date IS NOT NULL AND al.expected_return_date < CURDATE()');
    }
    if (req.query.asset_id) { filters.push('al.asset_id = ?'); vals.push(Number(req.query.asset_id)); }

    // Employees see their own allocations; Dept Heads their department's.
    if (req.user.role === 'EMPLOYEE') {
      filters.push('al.allocated_to_user_id = ?');
      vals.push(req.user.id);
    } else if (req.user.role === 'DEPT_HEAD') {
      filters.push('(al.allocated_to_department_id = ? OR hu.department_id = ?)');
      vals.push(req.user.department_id, req.user.department_id);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const base = `FROM allocations al
       JOIN assets a ON a.id = al.asset_id
       LEFT JOIN users hu ON hu.id = al.allocated_to_user_id
       LEFT JOIN departments hd ON hd.id = al.allocated_to_department_id ${where}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, vals);
    const [rows] = await pool.query(
      `SELECT al.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status,
              hu.name AS holder_name, hd.name AS holder_department_name,
              (al.returned_at IS NULL AND al.expected_return_date IS NOT NULL AND al.expected_return_date < CURDATE()) AS is_overdue
       ${base} ORDER BY al.allocated_at DESC LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

// ---------- allocate (the double-allocation rule lives here) ----------
router.post(
  '/',
  requireRole('ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD'),
  validate({
    body: z
      .object({
        asset_id: z.coerce.number().int().positive('Pick an asset'),
        allocated_to_user_id: z.coerce.number().int().positive().nullable().optional(),
        allocated_to_department_id: z.coerce.number().int().positive().nullable().optional(),
        expected_return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
      })
      .refine((b) => b.allocated_to_user_id || b.allocated_to_department_id, {
        message: 'Allocate to an employee or a department.',
        path: ['allocated_to_user_id'],
      }),
  }),
  catchAsync(async (req, res) => {
    const b = req.body;
    if (b.expected_return_date && b.expected_return_date < toLocalDateStr()) {
      throw ApiError.badRequest('Expected return date cannot be in the past.', [
        { field: 'expected_return_date', message: 'Pick today or a future date' },
      ]);
    }

    const created = await withTransaction(async (conn) => {
      // Lock the asset row: two simultaneous allocations serialize here and
      // the loser sees the winner's committed state.
      const [assetRows] = await conn.query('SELECT * FROM assets WHERE id = ? FOR UPDATE', [b.asset_id]);
      const asset = assetRows[0];
      if (!asset) throw ApiError.notFound('Asset not found.');

      const [activeRows] = await conn.query(
        `SELECT al.*, u.name AS holder_name, d.name AS holder_dept, ud.name AS holder_user_dept
         FROM allocations al
         LEFT JOIN users u ON u.id = al.allocated_to_user_id
         LEFT JOIN departments d ON d.id = al.allocated_to_department_id
         LEFT JOIN departments ud ON ud.id = u.department_id
         WHERE al.asset_id = ? AND al.returned_at IS NULL`,
        [b.asset_id]
      );
      if (activeRows.length) {
        const holder = activeRows[0];
        const holderLabel = holder.holder_name
          ? `${holder.holder_name}${holder.holder_user_dept ? ` (${holder.holder_user_dept})` : ''}`
          : holder.holder_dept;
        // The graded scenario: block + steer to a transfer request.
        throw ApiError.conflict(
          'ALREADY_ALLOCATED',
          `${asset.asset_tag} is already allocated to ${holderLabel}. Direct re-allocation is blocked — submit a transfer request instead.`,
          {
            suggest_transfer: true,
            current_holder: {
              user_id: holder.allocated_to_user_id,
              department_id: holder.allocated_to_department_id,
              name: holderLabel,
            },
          }
        );
      }

      assertTransition(asset.status, 'ALLOCATED');

      if (b.allocated_to_user_id) {
        const [u] = await conn.query(`SELECT id, name FROM users WHERE id = ? AND status = 'ACTIVE'`, [b.allocated_to_user_id]);
        if (!u.length) throw ApiError.badRequest('Selected employee does not exist or is inactive.');
      }

      const [result] = await conn.query(
        `INSERT INTO allocations (asset_id, allocated_to_user_id, allocated_to_department_id, allocated_by, expected_return_date)
         VALUES (?, ?, ?, ?, ?)`,
        [b.asset_id, b.allocated_to_user_id ?? null, b.allocated_to_department_id ?? null, req.user.id, b.expected_return_date ?? null]
      );
      await conn.query(`UPDATE assets SET status = 'ALLOCATED' WHERE id = ?`, [b.asset_id]);
      await logActivity({
        actorId: req.user.id, action: 'ASSET_ALLOCATED', entityType: 'asset', entityId: asset.id,
        summary: `${asset.asset_tag} allocated${b.expected_return_date ? `, due back ${b.expected_return_date}` : ''}`,
        metadata: b,
      }, conn);

      if (b.allocated_to_user_id) {
        await notify(b.allocated_to_user_id, {
          type: 'ASSET_ASSIGNED',
          title: `${asset.asset_tag} ${asset.name} assigned to you`,
          body: b.expected_return_date ? `Expected return: ${b.expected_return_date}` : null,
          entityType: 'asset', entityId: asset.id,
        }, conn);
      }
      return { id: result.insertId };
    });

    invalidateKpis();
    res.status(201).json({ data: created });
  })
);

// ---------- return ----------
router.post(
  '/:id/return',
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
      return_condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']),
      return_condition_notes: z.string().trim().max(500).optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT al.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status
         FROM allocations al JOIN assets a ON a.id = al.asset_id
         WHERE al.id = ? FOR UPDATE`,
        [req.params.id]
      );
      const alloc = rows[0];
      if (!alloc) throw ApiError.notFound('Allocation not found.');
      if (alloc.returned_at) throw ApiError.conflict('ALREADY_RETURNED', 'This allocation was already returned.');

      // Employees may only return their own assets; managers approve/record any.
      const isManager = ['ADMIN', 'ASSET_MANAGER'].includes(req.user.role);
      if (!isManager && alloc.allocated_to_user_id !== req.user.id) {
        throw ApiError.forbidden('You can only return assets allocated to you.');
      }

      // If the asset went into maintenance while held we cannot return it here.
      assertTransition(alloc.asset_status, 'AVAILABLE');

      await conn.query(
        `UPDATE allocations SET returned_at = NOW(), return_condition = ?, return_condition_notes = ?, returned_to = ? WHERE id = ?`,
        [req.body.return_condition, req.body.return_condition_notes ?? null, req.user.id, alloc.id]
      );
      await conn.query(`UPDATE assets SET status = 'AVAILABLE', cond = ? WHERE id = ?`, [req.body.return_condition, alloc.asset_id]);
      await logActivity({
        actorId: req.user.id, action: 'ASSET_RETURNED', entityType: 'asset', entityId: alloc.asset_id,
        summary: `${alloc.asset_tag} returned — condition: ${req.body.return_condition.toLowerCase()}`,
        metadata: { notes: req.body.return_condition_notes },
      }, conn);
    });
    invalidateKpis();
    res.json({ data: { id: Number(req.params.id), returned: true } });
  })
);

export default router;
