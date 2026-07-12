import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

const router = Router();
router.use(requireAuth);

const customFieldSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Keys must be snake_case'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['text', 'number', 'date']),
});

const categoryBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  custom_fields: z.array(customFieldSchema).max(10).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

router.get(
  '/',
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id) AS asset_count
       FROM asset_categories c ORDER BY c.name`
    );
    res.json({ data: rows });
  })
);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: categoryBody }),
  catchAsync(async (req, res) => {
    const { name, description = null, custom_fields = null } = req.body;
    const [dupe] = await pool.query('SELECT id FROM asset_categories WHERE name = ?', [name]);
    if (dupe.length) throw ApiError.conflict('DUPLICATE_NAME', `A category named "${name}" already exists.`);

    const [result] = await pool.query(
      'INSERT INTO asset_categories (name, description, custom_fields) VALUES (?, ?, ?)',
      [name, description, custom_fields ? JSON.stringify(custom_fields) : null]
    );
    await logActivity({
      actorId: req.user.id, action: 'CATEGORY_CREATED', entityType: 'category', entityId: result.insertId,
      summary: `Asset category "${name}" created`,
    });
    res.status(201).json({ data: { id: result.insertId } });
  })
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }), body: categoryBody.partial() }),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM asset_categories WHERE id = ?', [id]);
    if (!rows.length) throw ApiError.notFound('Category not found.');

    const sets = [];
    const vals = [];
    for (const f of ['name', 'description', 'status']) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (req.body.custom_fields !== undefined) {
      sets.push('custom_fields = ?');
      vals.push(req.body.custom_fields ? JSON.stringify(req.body.custom_fields) : null);
    }
    if (!sets.length) throw ApiError.badRequest('Nothing to update.');

    await pool.query(`UPDATE asset_categories SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    await logActivity({
      actorId: req.user.id, action: 'CATEGORY_UPDATED', entityType: 'category', entityId: id,
      summary: `Asset category "${rows[0].name}" updated`, metadata: req.body,
    });
    res.json({ data: { id } });
  })
);

export default router;
