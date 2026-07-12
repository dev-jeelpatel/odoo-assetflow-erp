import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { notify, invalidateKpis } from '../../utils/notify.js';
import { paged, meta } from '../../utils/pagination.js';
import { toSqlDateTime } from '../../utils/dates.js';

const router = Router();
router.use(requireAuth);

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time');

const bookingBody = z
  .object({
    asset_id: z.coerce.number().int().positive('Pick a resource'),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    purpose: z.string().trim().max(300).optional(),
    on_behalf_of_department_id: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((b) => new Date(b.ends_at) > new Date(b.starts_at), {
    message: 'End time must be after start time.',
    path: ['ends_at'],
  });

const toSql = toSqlDateTime;

/**
 * The overlap rule. Two slots collide iff new.start < old.end AND new.end > old.start.
 * Back-to-back (10:00 start against a 10:00 end) is legal by design.
 */
async function findConflict(conn, assetId, startsAt, endsAt, excludeId = null) {
  const [rows] = await conn.query(
    `SELECT b.id, b.starts_at, b.ends_at, u.name AS booked_by_name
     FROM bookings b JOIN users u ON u.id = b.booked_by
     WHERE b.asset_id = ? AND b.status IN ('UPCOMING','ONGOING')
       AND ? < b.ends_at AND ? > b.starts_at
       ${excludeId ? 'AND b.id != ?' : ''}
     ORDER BY b.starts_at LIMIT 1`,
    excludeId ? [assetId, toSql(startsAt), toSql(endsAt), excludeId] : [assetId, toSql(startsAt), toSql(endsAt)]
  );
  return rows[0] ?? null;
}

// ---------- list (mine or per-resource calendar feed) ----------
router.get(
  '/',
  catchAsync(async (req, res) => {
    const { page, limit, offset } = paged(req.query);
    const filters = [];
    const vals = [];

    if (req.query.asset_id) { filters.push('b.asset_id = ?'); vals.push(Number(req.query.asset_id)); }
    if (req.query.status) { filters.push('b.status = ?'); vals.push(req.query.status); }
    if (req.query.mine === 'true') { filters.push('b.booked_by = ?'); vals.push(req.user.id); }
    if (req.query.from) { filters.push('b.ends_at >= ?'); vals.push(toSql(req.query.from)); }
    if (req.query.to) { filters.push('b.starts_at <= ?'); vals.push(toSql(req.query.to)); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const base = `FROM bookings b
      JOIN assets a ON a.id = b.asset_id
      JOIN users u ON u.id = b.booked_by
      LEFT JOIN departments d ON d.id = b.on_behalf_of_department_id ${where}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, vals);
    const [rows] = await pool.query(
      `SELECT b.*, a.asset_tag, a.name AS asset_name, u.name AS booked_by_name, d.name AS department_name
       ${base} ORDER BY b.starts_at LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    res.json({ data: rows, meta: meta(page, limit, total) });
  })
);

// List of bookable resources for the picker.
router.get(
  '/resources',
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_tag, a.name, a.location, c.name AS category_name
       FROM assets a JOIN asset_categories c ON c.id = a.category_id
       WHERE a.is_bookable = 1 AND a.status NOT IN ('LOST','RETIRED','DISPOSED')
       ORDER BY a.name`
    );
    res.json({ data: rows });
  })
);

// ---------- create ----------
router.post(
  '/',
  validate({ body: bookingBody }),
  catchAsync(async (req, res) => {
    const b = req.body;
    if (new Date(b.starts_at) < new Date(Date.now() - 60_000)) {
      throw ApiError.badRequest('Bookings cannot start in the past.', [
        { field: 'starts_at', message: 'Pick a future time' },
      ]);
    }

    const created = await withTransaction(async (conn) => {
      const [assetRows] = await conn.query('SELECT * FROM assets WHERE id = ? FOR UPDATE', [b.asset_id]);
      const asset = assetRows[0];
      if (!asset) throw ApiError.notFound('Resource not found.');
      if (!asset.is_bookable) throw ApiError.badRequest(`${asset.asset_tag} is not a bookable resource.`);
      if (['LOST', 'RETIRED', 'DISPOSED'].includes(asset.status)) {
        throw ApiError.conflict('RESOURCE_UNAVAILABLE', `${asset.asset_tag} is ${asset.status.toLowerCase()} and cannot be booked.`);
      }

      const conflict = await findConflict(conn, b.asset_id, b.starts_at, b.ends_at);
      if (conflict) {
        const fmt = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        throw ApiError.conflict(
          'BOOKING_OVERLAP',
          `${asset.name} is already booked ${fmt(conflict.starts_at)} – ${fmt(conflict.ends_at)} by ${conflict.booked_by_name}. Pick a slot that starts at or after the existing one ends.`,
          { conflicting_booking: { id: conflict.id, starts_at: conflict.starts_at, ends_at: conflict.ends_at, booked_by: conflict.booked_by_name } }
        );
      }

      const ongoing = new Date(b.starts_at) <= new Date();
      const [result] = await conn.query(
        `INSERT INTO bookings (asset_id, booked_by, on_behalf_of_department_id, purpose, starts_at, ends_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.asset_id, req.user.id, b.on_behalf_of_department_id ?? null, b.purpose ?? null,
         toSql(b.starts_at), toSql(b.ends_at), ongoing ? 'ONGOING' : 'UPCOMING']
      );
      await logActivity({
        actorId: req.user.id, action: 'BOOKING_CREATED', entityType: 'booking', entityId: result.insertId,
        summary: `${asset.name} booked ${toSql(b.starts_at)} → ${toSql(b.ends_at)}`,
      }, conn);
      await notify(req.user.id, {
        type: 'BOOKING_CONFIRMED',
        title: `Booking confirmed: ${asset.name}`,
        body: `${new Date(b.starts_at).toLocaleString()} – ${new Date(b.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        entityType: 'booking', entityId: result.insertId,
      }, conn);
      return { id: result.insertId };
    });

    invalidateKpis();
    res.status(201).json({ data: created });
  })
);

// ---------- cancel ----------
router.post(
  '/:id/cancel',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT b.*, a.name AS asset_name FROM bookings b JOIN assets a ON a.id = b.asset_id WHERE b.id = ?`,
      [req.params.id]
    );
    const booking = rows[0];
    if (!booking) throw ApiError.notFound('Booking not found.');
    if (!['UPCOMING', 'ONGOING'].includes(booking.status)) {
      throw ApiError.conflict('NOT_CANCELLABLE', `A ${booking.status.toLowerCase()} booking cannot be cancelled.`);
    }
    const isManager = ['ADMIN', 'ASSET_MANAGER'].includes(req.user.role);
    if (!isManager && booking.booked_by !== req.user.id) {
      throw ApiError.forbidden('You can only cancel your own bookings.');
    }

    await pool.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = ?`, [booking.id]);
    await logActivity({
      actorId: req.user.id, action: 'BOOKING_CANCELLED', entityType: 'booking', entityId: booking.id,
      summary: `Booking for ${booking.asset_name} cancelled`,
    });
    await notify(booking.booked_by, {
      type: 'BOOKING_CANCELLED',
      title: `Booking cancelled: ${booking.asset_name}`,
      body: req.user.id === booking.booked_by ? null : `Cancelled by ${req.user.name}`,
      entityType: 'booking', entityId: booking.id,
    });
    invalidateKpis();
    res.json({ data: { id: booking.id, status: 'CANCELLED' } });
  })
);

// ---------- reschedule (same overlap validation, excluding itself) ----------
router.post(
  '/:id/reschedule',
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z
      .object({ starts_at: isoDateTime, ends_at: isoDateTime })
      .refine((b) => new Date(b.ends_at) > new Date(b.starts_at), {
        message: 'End time must be after start time.', path: ['ends_at'],
      }),
  }),
  catchAsync(async (req, res) => {
    const b = req.body;
    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT b.*, a.name AS asset_name FROM bookings b JOIN assets a ON a.id = b.asset_id WHERE b.id = ? FOR UPDATE`,
        [req.params.id]
      );
      const booking = rows[0];
      if (!booking) throw ApiError.notFound('Booking not found.');
      if (booking.status !== 'UPCOMING') {
        throw ApiError.conflict('NOT_RESCHEDULABLE', 'Only upcoming bookings can be rescheduled.');
      }
      const isManager = ['ADMIN', 'ASSET_MANAGER'].includes(req.user.role);
      if (!isManager && booking.booked_by !== req.user.id) {
        throw ApiError.forbidden('You can only reschedule your own bookings.');
      }
      if (new Date(b.starts_at) < new Date()) {
        throw ApiError.badRequest('The new slot cannot start in the past.');
      }

      const conflict = await findConflict(conn, booking.asset_id, b.starts_at, b.ends_at, booking.id);
      if (conflict) {
        throw ApiError.conflict(
          'BOOKING_OVERLAP',
          `That slot collides with an existing booking (${new Date(conflict.starts_at).toLocaleString()} – ${new Date(conflict.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`,
          { conflicting_booking: conflict }
        );
      }

      await conn.query(
        `UPDATE bookings SET starts_at = ?, ends_at = ?, reminder_sent = 0 WHERE id = ?`,
        [toSql(b.starts_at), toSql(b.ends_at), booking.id]
      );
      await logActivity({
        actorId: req.user.id, action: 'BOOKING_RESCHEDULED', entityType: 'booking', entityId: booking.id,
        summary: `Booking for ${booking.asset_name} moved to ${toSql(b.starts_at)}`,
      }, conn);
    });
    invalidateKpis();
    res.json({ data: { id: Number(req.params.id) } });
  })
);

export default router;
