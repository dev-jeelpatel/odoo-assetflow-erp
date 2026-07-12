import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { catchAsync } from '../../utils/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paged, meta } from '../../utils/pagination.js';

const router = Router();
router.use(requireAuth);

// Full who-did-what-when trail. Managers/admins only.
router.get(
  '/',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];
    if (req.query.entity_type) { filters.push('l.entity_type = ?'); vals.push(req.query.entity_type); }
    if (req.query.action) { filters.push('l.action = ?'); vals.push(req.query.action); }
    if (req.query.actor_id) { filters.push('l.actor_user_id = ?'); vals.push(Number(req.query.actor_id)); }
    if (req.query.search) { filters.push('l.summary LIKE ?'); vals.push(`%${req.query.search}%`); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM activity_logs l ${where}`, vals);
    const [rows] = await pool.query(
      `SELECT l.*, u.name AS actor_name, u.role AS actor_role
       FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_user_id
       ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

export default router;
