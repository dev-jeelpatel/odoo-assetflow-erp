import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { catchAsync } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { computeBookValue } from '../../utils/depreciation.js';

const router = Router();
router.use(requireAuth);

// Monday-start week boundaries, used to compute honest week-over-week deltas
// (real counts of things that happened, not fabricated percentages).
function weekBounds(reference) {
  const diffToMonday = (reference.getDay() + 6) % 7;
  const thisWeekStart = new Date(reference);
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

// Parses a ?date=YYYY-MM-DD query param into start/end-of-day boundaries.
// Falls back to "now" (live dashboard) when absent or malformed.
function resolveAsOf(dateParam) {
  const now = new Date();
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return { asOf: now, dayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()), isToday: true };
  }
  const [y, m, d] = dateParam.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dayStart.getTime())) {
    return { asOf: now, dayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()), isToday: true };
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isToday = dayStart.getTime() === todayStart.getTime();
  // "As of" a past/today date means end-of-day (23:59:59.999) unless it's
  // today, in which case we use the real current instant so live data still
  // reflects what's happening right now.
  const asOf = isToday ? now : new Date(y, m - 1, d, 23, 59, 59, 999);
  return { asOf, dayStart, isToday };
}

router.get(
  '/kpis',
  catchAsync(async (req, res) => {
    const { asOf, dayStart, isToday } = resolveAsOf(req.query.date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    const returnWindowEnd = new Date(dayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Every count below is reconstructed from real timestamped columns
    // (allocated_at/returned_at, decided_at/resolved_at, created_at, ...) so
    // picking a past date shows genuine point-in-time state, not a guess.
    const [[kpis]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM assets WHERE COALESCE(acquisition_date, DATE(created_at)) <= ?) AS total_assets,
         (SELECT COUNT(DISTINCT asset_id) FROM allocations
            WHERE allocated_at <= ? AND (returned_at IS NULL OR returned_at > ?)) AS allocated,
         (SELECT COUNT(DISTINCT asset_id) FROM maintenance_requests
            WHERE decided_at <= ? AND status != 'REJECTED' AND (resolved_at IS NULL OR resolved_at > ?)) AS under_maintenance,
         (SELECT COUNT(*) FROM assets WHERE status IN ('LOST','RETIRED','DISPOSED') AND updated_at <= ?) AS terminal_assets,
         (SELECT COUNT(*) FROM bookings
            WHERE status != 'CANCELLED' AND starts_at <= ? AND ends_at >= ?) AS active_bookings,
         (SELECT COUNT(*) FROM transfer_requests
            WHERE created_at <= ? AND (decided_at IS NULL OR decided_at > ?)) AS pending_transfers,
         (SELECT COUNT(*) FROM allocations
            WHERE allocated_at <= ? AND (returned_at IS NULL OR returned_at > ?)
              AND expected_return_date IS NOT NULL AND expected_return_date >= ? AND expected_return_date <= ?) AS upcoming_returns,
         (SELECT COUNT(*) FROM allocations
            WHERE allocated_at <= ? AND (returned_at IS NULL OR returned_at > ?)
              AND expected_return_date IS NOT NULL AND expected_return_date < ?) AS overdue_returns,
         (SELECT COUNT(*) FROM maintenance_requests
            WHERE created_at <= ? AND (decided_at IS NULL OR decided_at > ?)) AS pending_maintenance
      `,
      [
        asOf,
        asOf, asOf,
        asOf, asOf,
        asOf,
        dayEnd, dayStart,
        asOf, asOf,
        asOf, asOf, dayStart, returnWindowEnd,
        asOf, asOf, dayStart,
        asOf, asOf,
      ]
    );
    kpis.available = Math.max(kpis.total_assets - kpis.allocated - kpis.under_maintenance - kpis.terminal_assets, 0);
    kpis.maintenance_today = kpis.under_maintenance;
    delete kpis.total_assets;
    delete kpis.terminal_assets;

    // Book value as of the same point-in-time date, computed in JS (not SQL)
    // to keep the straight-line formula in one place (utils/depreciation.js).
    const [assetRows] = await pool.query(
      `SELECT acquisition_cost, acquisition_date, useful_life_years FROM assets
       WHERE status != 'DISPOSED' AND COALESCE(acquisition_date, DATE(created_at)) <= ?`,
      [asOf]
    );
    kpis.total_acquisition_cost = assetRows.reduce((s, a) => s + Number(a.acquisition_cost ?? 0), 0);
    kpis.total_book_value = assetRows.reduce((s, a) => s + computeBookValue(a, asOf), 0);

    // Overdue detail for the callout, reconstructed as of the same date.
    const [overdue] = await pool.query(
      `SELECT al.id, al.expected_return_date, a.asset_tag, a.name AS asset_name, u.name AS holder_name,
              DATEDIFF(?, al.expected_return_date) AS days_overdue
       FROM allocations al
       JOIN assets a ON a.id = al.asset_id
       LEFT JOIN users u ON u.id = al.allocated_to_user_id
       WHERE al.allocated_at <= ? AND (al.returned_at IS NULL OR al.returned_at > ?)
         AND al.expected_return_date IS NOT NULL AND al.expected_return_date < ?
       ORDER BY al.expected_return_date LIMIT 10`,
      [dayStart, asOf, asOf, dayStart]
    );

    // Pending maintenance approvals as of the same date.
    const [pendingMaintenance] = await pool.query(
      `SELECT m.id, m.priority, m.created_at, a.asset_tag, a.name AS asset_name
       FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
       WHERE m.created_at <= ? AND (m.decided_at IS NULL OR m.decided_at > ?)
       ORDER BY FIELD(m.priority,'CRITICAL','HIGH','MEDIUM','LOW'), m.created_at LIMIT 10`,
      [asOf, asOf]
    );

    // "Starting in the next 30 minutes" only means something for the live
    // dashboard — for a past/future date we show nothing rather than a
    // nonsensical relative-time claim.
    const bookingsSoon = isToday
      ? (
          await pool.query(
            `SELECT b.id, b.starts_at, a.asset_tag, a.name AS asset_name
             FROM bookings b JOIN assets a ON a.id = b.asset_id
             WHERE b.status = 'UPCOMING' AND b.starts_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 MINUTE)
             ORDER BY b.starts_at LIMIT 10`
          )
        )[0]
      : [];

    // Recent Activity: the live dashboard shows the latest events overall;
    // a selected date instead shows everything that happened that day.
    const [recent] = isToday
      ? await pool.query(
          `SELECT l.id, l.action, l.summary, l.created_at, u.name AS actor_name
           FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_user_id
           ORDER BY l.created_at DESC, l.id DESC LIMIT 8`
        )
      : await pool.query(
          `SELECT l.id, l.action, l.summary, l.created_at, u.name AS actor_name
           FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_user_id
           WHERE l.created_at BETWEEN ? AND ?
           ORDER BY l.created_at DESC, l.id DESC LIMIT 20`,
          [dayStart, dayEnd]
        );

    // Week-over-week activity trends, computed relative to the selected
    // date's week rather than always "today".
    const { thisWeekStart, lastWeekStart } = weekBounds(dayStart);
    const [[flow]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM assets WHERE created_at >= ? AND created_at <= ?) AS available_this,
         (SELECT COUNT(*) FROM assets WHERE created_at >= ? AND created_at < ?) AS available_last,
         (SELECT COUNT(*) FROM allocations WHERE allocated_at >= ? AND allocated_at <= ?) AS allocated_this,
         (SELECT COUNT(*) FROM allocations WHERE allocated_at >= ? AND allocated_at < ?) AS allocated_last,
         (SELECT COUNT(*) FROM maintenance_requests WHERE decided_at >= ? AND decided_at <= ? AND status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED')) AS maintenance_this,
         (SELECT COUNT(*) FROM maintenance_requests WHERE decided_at >= ? AND decided_at < ? AND status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED')) AS maintenance_last,
         (SELECT COUNT(*) FROM bookings WHERE created_at >= ? AND created_at <= ?) AS bookings_this,
         (SELECT COUNT(*) FROM bookings WHERE created_at >= ? AND created_at < ?) AS bookings_last,
         (SELECT COUNT(*) FROM transfer_requests WHERE created_at >= ? AND created_at <= ?) AS transfers_this,
         (SELECT COUNT(*) FROM transfer_requests WHERE created_at >= ? AND created_at < ?) AS transfers_last,
         (SELECT COUNT(*) FROM allocations WHERE returned_at >= ? AND returned_at <= ?) AS returns_this,
         (SELECT COUNT(*) FROM allocations WHERE returned_at >= ? AND returned_at < ?) AS returns_last
       `,
      [
        thisWeekStart, asOf, lastWeekStart, thisWeekStart,
        thisWeekStart, asOf, lastWeekStart, thisWeekStart,
        thisWeekStart, asOf, lastWeekStart, thisWeekStart,
        thisWeekStart, asOf, lastWeekStart, thisWeekStart,
        thisWeekStart, asOf, lastWeekStart, thisWeekStart,
        thisWeekStart, asOf, lastWeekStart, thisWeekStart,
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

    res.json({
      data: {
        as_of_date: dayStart.toISOString().slice(0, 10),
        is_today: isToday,
        kpis,
        trends,
        overdue,
        pending_maintenance: pendingMaintenance,
        bookings_soon: bookingsSoon,
        recent_activity: recent,
      },
    });
  })
);

export default router;
