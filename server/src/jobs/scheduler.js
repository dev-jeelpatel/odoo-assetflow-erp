/**
 * In-process scheduler (runs every 60s). Three duties:
 *  1. Flag overdue allocations and alert holder + managers (once per allocation).
 *  2. Advance booking statuses UPCOMING → ONGOING → COMPLETED as time passes.
 *  3. Send a reminder ~15 minutes before a booking starts (once per booking).
 */
import { pool } from '../db/pool.js';
import { notify, notifyRole, invalidateKpis } from '../utils/notify.js';
import { logActivity } from '../utils/activityLog.js';

async function flagOverdueAllocations() {
  const [rows] = await pool.query(`
    SELECT al.id, al.allocated_to_user_id, al.expected_return_date,
           a.asset_tag, a.name AS asset_name,
           DATEDIFF(CURDATE(), al.expected_return_date) AS days_overdue
    FROM allocations al JOIN assets a ON a.id = al.asset_id
    WHERE al.returned_at IS NULL AND al.is_overdue_flagged = 0
      AND al.expected_return_date IS NOT NULL AND al.expected_return_date < CURDATE()
  `);
  for (const r of rows) {
    await pool.query('UPDATE allocations SET is_overdue_flagged = 1 WHERE id = ?', [r.id]);
    await logActivity({
      action: 'OVERDUE_FLAGGED', entityType: 'allocation', entityId: r.id,
      summary: `${r.asset_tag} is ${r.days_overdue} day(s) overdue for return`,
    });
    const payload = {
      type: 'OVERDUE_RETURN',
      title: `Overdue: ${r.asset_tag} ${r.asset_name}`,
      body: `Was due back ${r.days_overdue} day(s) ago (${String(r.expected_return_date).slice(0, 10)}).`,
      entityType: 'allocation', entityId: r.id,
    };
    if (r.allocated_to_user_id) await notify(r.allocated_to_user_id, payload);
    await notifyRole(['ASSET_MANAGER'], payload);
  }
  return rows.length;
}

async function advanceBookingStatuses() {
  const [started] = await pool.query(
    `UPDATE bookings SET status = 'ONGOING' WHERE status = 'UPCOMING' AND starts_at <= NOW() AND ends_at > NOW()`
  );
  const [completed] = await pool.query(
    `UPDATE bookings SET status = 'COMPLETED' WHERE status IN ('UPCOMING','ONGOING') AND ends_at <= NOW()`
  );
  return started.affectedRows + completed.affectedRows;
}

async function sendBookingReminders() {
  const [rows] = await pool.query(`
    SELECT b.id, b.booked_by, b.starts_at, a.name AS asset_name
    FROM bookings b JOIN assets a ON a.id = b.asset_id
    WHERE b.status = 'UPCOMING' AND b.reminder_sent = 0
      AND b.starts_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 15 MINUTE)
  `);
  for (const r of rows) {
    await pool.query('UPDATE bookings SET reminder_sent = 1 WHERE id = ?', [r.id]);
    await notify(r.booked_by, {
      type: 'BOOKING_REMINDER',
      title: `Starting soon: ${r.asset_name}`,
      body: `Your booking starts at ${new Date(r.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      entityType: 'booking', entityId: r.id,
    });
  }
  return rows.length;
}

export function startScheduler() {
  const tick = async () => {
    try {
      const changes =
        (await flagOverdueAllocations()) + (await advanceBookingStatuses()) + (await sendBookingReminders());
      if (changes > 0) invalidateKpis();
    } catch (err) {
      console.error('[scheduler]', err.message);
    }
  };
  tick(); // run once at boot so seeded overdue items flag immediately
  setInterval(tick, 60_000);
  console.log('Scheduler started (60s tick).');
}
