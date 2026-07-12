import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { addClient } from '../../utils/sse.js';
import { paged, meta } from '../../utils/pagination.js';

const router = Router();
router.use(requireAuth);

// Live event stream: notifications + KPI invalidations.
router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');
  addClient(req.user.id, res);
  // Heartbeat keeps proxies from killing the idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => clearInterval(heartbeat));
});

router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = ['n.user_id = ?'];
    const vals = [req.user.id];
    if (req.query.unread === 'true') filters.push('n.read_at IS NULL');
    if (req.query.type_group === 'alerts') {
      filters.push(`n.type IN ('OVERDUE_RETURN','AUDIT_DISCREPANCY','MAINTENANCE_RAISED')`);
    } else if (req.query.type_group === 'approvals') {
      filters.push(`n.type IN ('MAINTENANCE_APPROVED','MAINTENANCE_REJECTED','TRANSFER_APPROVED','TRANSFER_REJECTED','TRANSFER_REQUESTED','ROLE_CHANGED')`);
    } else if (req.query.type_group === 'bookings') {
      filters.push(`n.type IN ('BOOKING_CONFIRMED','BOOKING_CANCELLED','BOOKING_REMINDER')`);
    }
    const where = `WHERE ${filters.join(' AND ')}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notifications n ${where}`, vals);
    const [rows] = await pool.query(
      `SELECT n.* FROM notifications n ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

router.patch(
  '/:id/read',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [result] = await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) throw ApiError.notFound('Notification not found (or already read).');
    res.json({ data: { id: Number(req.params.id) } });
  })
);

router.post(
  '/read-all',
  catchAsync(async (req, res) => {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ data: { ok: true } });
  })
);

export default router;
