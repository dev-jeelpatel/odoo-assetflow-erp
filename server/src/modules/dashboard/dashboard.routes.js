import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { catchAsync } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/kpis',
  catchAsync(async (req, res) => {
    const [[kpis]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM assets WHERE status = 'AVAILABLE') AS available,
        (SELECT COUNT(*) FROM assets WHERE status = 'ALLOCATED') AS allocated,
        (SELECT COUNT(*) FROM assets WHERE status = 'UNDER_MAINTENANCE') AS under_maintenance,
        (SELECT COUNT(*) FROM maintenance_requests WHERE status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS')
           OR (status = 'RESOLVED' AND DATE(resolved_at) = CURDATE())) AS maintenance_today,
        (SELECT COUNT(*) FROM bookings WHERE status IN ('UPCOMING','ONGOING')) AS active_bookings,
        (SELECT COUNT(*) FROM transfer_requests WHERE status = 'REQUESTED') AS pending_transfers,
        (SELECT COUNT(*) FROM allocations WHERE returned_at IS NULL AND expected_return_date IS NOT NULL
           AND expected_return_date >= CURDATE() AND expected_return_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)) AS upcoming_returns,
        (SELECT COUNT(*) FROM allocations WHERE returned_at IS NULL AND expected_return_date IS NOT NULL
           AND expected_return_date < CURDATE()) AS overdue_returns,
        (SELECT COUNT(*) FROM maintenance_requests WHERE status = 'PENDING') AS pending_maintenance
    `);

    // Overdue detail for the red callout — separate from upcoming by design.
    const [overdue] = await pool.query(
      `SELECT al.id, al.expected_return_date, a.asset_tag, a.name AS asset_name, u.name AS holder_name,
              DATEDIFF(CURDATE(), al.expected_return_date) AS days_overdue
       FROM allocations al
       JOIN assets a ON a.id = al.asset_id
       LEFT JOIN users u ON u.id = al.allocated_to_user_id
       WHERE al.returned_at IS NULL AND al.expected_return_date < CURDATE()
       ORDER BY al.expected_return_date LIMIT 10`
    );
    const [recent] = await pool.query(
      `SELECT l.id, l.action, l.summary, l.created_at, u.name AS actor_name
       FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC, l.id DESC LIMIT 8`
    );
    res.json({ data: { kpis, overdue, recent_activity: recent } });
  })
);

export default router;
