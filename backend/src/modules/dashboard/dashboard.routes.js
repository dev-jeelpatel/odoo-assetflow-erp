import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { catchAsync } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Monday-start week boundaries, used to compute honest week-over-week deltas
// (real counts of things that happened, not fabricated percentages).
function weekBounds() {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setHours(0, 0, 0, 0);
  thisWeekStart.setDate(thisWeekStart.getDate() - diffToMonday);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  return { thisWeekStart, lastWeekStart };
}

function trendOf(thisWeek, lastWeek) {
  thisWeek = Number(thisWeek);
  lastWeek = Number(lastWeek);
  if (thisWeek === lastWeek) return { direction: 'flat', pct: 0 };
  if (lastWeek === 0) return { direction: 'up', pct: 100 };
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return { direction: pct >= 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

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

    // Pending maintenance approvals and bookings starting soon — the other
    // two alert categories in the dashboard's Overdue & Alerts panel.
    const [pendingMaintenance] = await pool.query(
      `SELECT m.id, m.priority, m.created_at, a.asset_tag, a.name AS asset_name
       FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
       WHERE m.status = 'PENDING'
       ORDER BY FIELD(m.priority,'CRITICAL','HIGH','MEDIUM','LOW'), m.created_at LIMIT 10`
    );
    const [bookingsSoon] = await pool.query(
      `SELECT b.id, b.starts_at, a.asset_tag, a.name AS asset_name
       FROM bookings b JOIN assets a ON a.id = b.asset_id
       WHERE b.status = 'UPCOMING' AND b.starts_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 MINUTE)
       ORDER BY b.starts_at LIMIT 10`
    );

    // Week-over-week activity trends: real counts of things that happened in
    // each window, not invented percentages against a metric we have no
    // history for.
    const { thisWeekStart, lastWeekStart } = weekBounds();
    const [[flow]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM assets WHERE created_at >= ?) AS available_this,
         (SELECT COUNT(*) FROM assets WHERE created_at >= ? AND created_at < ?) AS available_last,
         (SELECT COUNT(*) FROM allocations WHERE allocated_at >= ?) AS allocated_this,
         (SELECT COUNT(*) FROM allocations WHERE allocated_at >= ? AND allocated_at < ?) AS allocated_last,
         (SELECT COUNT(*) FROM maintenance_requests WHERE decided_at >= ? AND status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED')) AS maintenance_this,
         (SELECT COUNT(*) FROM maintenance_requests WHERE decided_at >= ? AND decided_at < ? AND status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED')) AS maintenance_last,
         (SELECT COUNT(*) FROM bookings WHERE created_at >= ?) AS bookings_this,
         (SELECT COUNT(*) FROM bookings WHERE created_at >= ? AND created_at < ?) AS bookings_last,
         (SELECT COUNT(*) FROM transfer_requests WHERE created_at >= ?) AS transfers_this,
         (SELECT COUNT(*) FROM transfer_requests WHERE created_at >= ? AND created_at < ?) AS transfers_last,
         (SELECT COUNT(*) FROM allocations WHERE returned_at >= ?) AS returns_this,
         (SELECT COUNT(*) FROM allocations WHERE returned_at >= ? AND returned_at < ?) AS returns_last
       `,
      [
        thisWeekStart, lastWeekStart, thisWeekStart,
        thisWeekStart, lastWeekStart, thisWeekStart,
        thisWeekStart, lastWeekStart, thisWeekStart,
        thisWeekStart, lastWeekStart, thisWeekStart,
        thisWeekStart, lastWeekStart, thisWeekStart,
        thisWeekStart, lastWeekStart, thisWeekStart,
      ]
    );

    const trends = {
      available: trendOf(flow.available_this, flow.available_last),
      allocated: trendOf(flow.allocated_this, flow.allocated_last),
      under_maintenance: trendOf(flow.maintenance_this, flow.maintenance_last),
      active_bookings: trendOf(flow.bookings_this, flow.bookings_last),
      pending_transfers: trendOf(flow.transfers_this, flow.transfers_last),
      upcoming_returns: trendOf(flow.returns_this, flow.returns_last),
    };

    res.json({ data: { kpis, trends, overdue, pending_maintenance: pendingMaintenance, bookings_soon: bookingsSoon, recent_activity: recent } });
  })
);

export default router;
