import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { notify } from '../../utils/notify.js';
import { paged, meta } from '../../utils/pagination.js';

const router = Router();
router.use(requireAuth);

// Directory list: everyone can read (needed for allocation/transfer pickers),
// but only Admin sees it in full management mode client-side.
router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];
    if (req.query.search) {
      filters.push('(u.name LIKE ? OR u.email LIKE ?)');
      vals.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }
    if (req.query.role && ROLES.includes(req.query.role)) {
      filters.push('u.role = ?');
      vals.push(req.query.role);
    }
    if (req.query.department_id) {
      filters.push('u.department_id = ?');
      vals.push(Number(req.query.department_id));
    }
    if (req.query.status) {
      filters.push('u.status = ?');
      vals.push(req.query.status);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${where}`, vals);
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.status, u.created_at, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       ${where} ORDER BY u.name LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

// THE only place roles change. Admin-only, and never via signup.
router.patch(
  '/:id/role',
  requireRole('ADMIN'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ role: z.enum(['ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD', 'EMPLOYEE']) }),
  }),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    const target = rows[0];
    if (!target) throw ApiError.notFound('User not found.');
    if (target.role === role) throw ApiError.badRequest(`${target.name} already has the ${role} role.`);

    // Never let the org lock itself out by demoting the last Admin.
    if (target.role === 'ADMIN') {
      const [[{ admins }]] = await pool.query(
        `SELECT COUNT(*) AS admins FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`
      );
      if (admins <= 1) {
        throw ApiError.conflict('LAST_ADMIN', 'Cannot demote the only remaining Admin.');
      }
    }

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    await logActivity({
      actorId: req.user.id, action: 'ROLE_CHANGED', entityType: 'user', entityId: id,
      summary: `${target.name}: ${target.role} → ${role}`,
      metadata: { from: target.role, to: role },
    });
    await notify(id, {
      type: 'ROLE_CHANGED',
      title: `Your role is now ${role.replace('_', ' ')}`,
      body: `Changed by ${req.user.name}. Log out and back in to see your new menus.`,
      entityType: 'user', entityId: Number(id),
    });
    res.json({ data: { id: Number(id), role } });
  })
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      department_id: z.coerce.number().int().positive().nullable().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    const target = rows[0];
    if (!target) throw ApiError.notFound('User not found.');

    if (req.body.status === 'INACTIVE' && target.role === 'ADMIN') {
      const [[{ admins }]] = await pool.query(
        `SELECT COUNT(*) AS admins FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`
      );
      if (admins <= 1) throw ApiError.conflict('LAST_ADMIN', 'Cannot deactivate the only remaining Admin.');
    }

    const sets = [];
    const vals = [];
    for (const f of ['name', 'department_id', 'status']) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (!sets.length) throw ApiError.badRequest('Nothing to update.');
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);

    await logActivity({
      actorId: req.user.id, action: 'USER_UPDATED', entityType: 'user', entityId: id,
      summary: `${target.name}'s profile updated`, metadata: req.body,
    });
    res.json({ data: { id: Number(id) } });
  })
);

export default router;
