import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

const router = Router();
router.use(requireAuth);

const deptBody = z.object({
  name: z.string().trim().min(2).max(120),
  head_user_id: z.coerce.number().int().positive().nullable().optional(),
  parent_department_id: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// Everyone can read departments (picklists everywhere); only Admin mutates.
router.get(
  '/',
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT d.*, h.name AS head_name, p.name AS parent_name,
              (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.status='ACTIVE') AS member_count,
              (SELECT COUNT(*) FROM assets a WHERE a.department_id = d.id) AS asset_count
       FROM departments d
       LEFT JOIN users h ON h.id = d.head_user_id
       LEFT JOIN departments p ON p.id = d.parent_department_id
       ORDER BY d.name`
    );
    res.json({ data: rows });
  })
);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: deptBody }),
  catchAsync(async (req, res) => {
    const { name, head_user_id = null, parent_department_id = null } = req.body;
    const [dupe] = await pool.query('SELECT id FROM departments WHERE name = ?', [name]);
    if (dupe.length) throw ApiError.conflict('DUPLICATE_NAME', `A department named "${name}" already exists.`);

    const [result] = await pool.query(
      'INSERT INTO departments (name, head_user_id, parent_department_id) VALUES (?, ?, ?)',
      [name, head_user_id, parent_department_id]
    );
    await logActivity({
      actorId: req.user.id, action: 'DEPARTMENT_CREATED', entityType: 'department', entityId: result.insertId,
      summary: `Department "${name}" created`,
    });
    res.status(201).json({ data: { id: result.insertId } });
  })
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }), body: deptBody.partial() }),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [id]);
    if (!rows.length) throw ApiError.notFound('Department not found.');

    if (req.body.parent_department_id === id) {
      throw ApiError.badRequest('A department cannot be its own parent.');
    }
    const fields = ['name', 'head_user_id', 'parent_department_id', 'status'];
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (!updates.length) throw ApiError.badRequest('Nothing to update.');

    await pool.query(
      `UPDATE departments SET ${updates.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...updates.map((f) => req.body[f]), id]
    );
    await logActivity({
      actorId: req.user.id, action: 'DEPARTMENT_UPDATED', entityType: 'department', entityId: id,
      summary: `Department "${rows[0].name}" updated`, metadata: req.body,
    });
    res.json({ data: { id } });
  })
);

export default router;
