import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { computeBookValue } from '../../utils/depreciation.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD'));

// Department-wise allocation summary + utilization.
router.get(
  '/utilization',
  catchAsync(async (req, res) => {
    const [byDepartment] = await pool.query(`
      SELECT d.name AS department,
             COUNT(a.id) AS total_assets,
             SUM(a.status = 'ALLOCATED') AS allocated,
             SUM(a.status = 'AVAILABLE') AS available,
             SUM(a.status = 'UNDER_MAINTENANCE') AS under_maintenance
      FROM departments d
      LEFT JOIN assets a ON a.department_id = d.id
      WHERE d.status = 'ACTIVE'
      GROUP BY d.id ORDER BY total_assets DESC
    `);
    const [byStatus] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM assets GROUP BY status ORDER BY count DESC`
    );
    // Most used = most booking hours in the last 30 days; idle = bookable with none.
    const [mostUsed] = await pool.query(`
      SELECT a.asset_tag, a.name, COUNT(b.id) AS bookings,
             ROUND(SUM(TIMESTAMPDIFF(MINUTE, b.starts_at, b.ends_at)) / 60, 1) AS hours
      FROM bookings b JOIN assets a ON a.id = b.asset_id
      WHERE b.status != 'CANCELLED' AND b.starts_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY a.id ORDER BY hours DESC LIMIT 5
    `);
    const [idle] = await pool.query(`
      SELECT a.asset_tag, a.name,
             (SELECT MAX(b.ends_at) FROM bookings b WHERE b.asset_id = a.id AND b.status != 'CANCELLED') AS last_used
      FROM assets a
      WHERE a.is_bookable = 1 AND NOT EXISTS (
        SELECT 1 FROM bookings b WHERE b.asset_id = a.id AND b.status != 'CANCELLED'
          AND b.starts_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ) LIMIT 5
    `);
    res.json({ data: { by_department: byDepartment, by_status: byStatus, most_used: mostUsed, idle } });
  })
);

router.get(
  '/maintenance-frequency',
  catchAsync(async (req, res) => {
    const [byMonth] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS requests,
             SUM(status = 'RESOLVED') AS resolved
      FROM maintenance_requests
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month
    `);
    const [byCategory] = await pool.query(`
      SELECT c.name AS category, COUNT(m.id) AS requests
      FROM maintenance_requests m
      JOIN assets a ON a.id = m.asset_id
      JOIN asset_categories c ON c.id = a.category_id
      GROUP BY c.id ORDER BY requests DESC
    `);
    const [topAssets] = await pool.query(`
      SELECT a.asset_tag, a.name, COUNT(m.id) AS requests
      FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
      GROUP BY a.id ORDER BY requests DESC LIMIT 5
    `);
    res.json({ data: { by_month: byMonth, by_category: byCategory, top_assets: topAssets } });
  })
);

// Assets due for maintenance follow-up or nearing retirement.
router.get(
  '/due-soon',
  catchAsync(async (req, res) => {
    const [returnsDue] = await pool.query(`
      SELECT a.asset_tag, a.name, al.expected_return_date, u.name AS holder_name,
             DATEDIFF(al.expected_return_date, CURDATE()) AS days_left
      FROM allocations al
      JOIN assets a ON a.id = al.asset_id
      LEFT JOIN users u ON u.id = al.allocated_to_user_id
      WHERE al.returned_at IS NULL AND al.expected_return_date IS NOT NULL
      ORDER BY al.expected_return_date LIMIT 15
    `);
    // "Nearing retirement" = acquired 4+ years ago (industry-agnostic heuristic).
    const [nearingRetirement] = await pool.query(`
      SELECT asset_tag, name, acquisition_date,
             TIMESTAMPDIFF(YEAR, acquisition_date, CURDATE()) AS age_years
      FROM assets
      WHERE acquisition_date IS NOT NULL AND status NOT IN ('RETIRED','DISPOSED','LOST')
        AND acquisition_date <= DATE_SUB(CURDATE(), INTERVAL 4 YEAR)
      ORDER BY acquisition_date LIMIT 10
    `);
    const [inMaintenance] = await pool.query(`
      SELECT a.asset_tag, a.name, m.priority, m.status, m.created_at
      FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
      WHERE m.status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS')
      ORDER BY FIELD(m.priority,'CRITICAL','HIGH','MEDIUM','LOW')
    `);
    res.json({ data: { returns_due: returnsDue, nearing_retirement: nearingRetirement, in_maintenance: inMaintenance } });
  })
);

// Booking heatmap: bookings per weekday × hour over the last 30 days.
router.get(
  '/booking-heatmap',
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT WEEKDAY(starts_at) AS weekday, HOUR(starts_at) AS hour, COUNT(*) AS count
      FROM bookings
      WHERE status != 'CANCELLED' AND starts_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY weekday, hour
    `);
    res.json({ data: rows });
  })
);

// Current portfolio book value: totals, per-category breakdown, and a
// forward-looking projection (not fabricated history — no historical cost
// tracking exists, so this recomputes the same straight-line formula at
// future as-of dates using real current data).
router.get(
  '/asset-value',
  catchAsync(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT a.acquisition_cost, a.acquisition_date, a.useful_life_years, c.name AS category
      FROM assets a JOIN asset_categories c ON c.id = a.category_id
      WHERE a.status != 'DISPOSED'
    `);

    const now = new Date();
    let total_acquisition_cost = 0;
    let total_book_value = 0;
    const byCategory = new Map();
    for (const a of rows) {
      const cost = Number(a.acquisition_cost ?? 0);
      const value = computeBookValue(a, now);
      total_acquisition_cost += cost;
      total_book_value += value;
      const entry = byCategory.get(a.category) ?? { category: a.category, acquisition_cost: 0, book_value: 0, asset_count: 0 };
      entry.acquisition_cost += cost;
      entry.book_value += value;
      entry.asset_count += 1;
      byCategory.set(a.category, entry);
    }

    const projection = [];
    for (let yearOffset = 0; yearOffset <= 6; yearOffset++) {
      const asOf = new Date(now);
      asOf.setFullYear(asOf.getFullYear() + yearOffset);
      const value = rows.reduce((s, a) => s + computeBookValue(a, asOf), 0);
      projection.push({ year_offset: yearOffset, label: yearOffset === 0 ? 'Today' : `+${yearOffset}y`, book_value: value });
    }

    res.json({
      data: {
        total_acquisition_cost,
        total_book_value,
        by_category: [...byCategory.values()].sort((a, b) => b.book_value - a.book_value),
        projection,
      },
    });
  })
);

// CSV export — generated in plain code, no libraries.
router.get(
  '/:name/export',
  catchAsync(async (req, res) => {
    const queries = {
      assets: `SELECT a.asset_tag AS Tag, a.name AS Name, c.name AS Category, a.status AS Status,
                      a.cond AS Cond, a.location AS Location, d.name AS Department,
                      a.serial_number AS Serial, a.acquisition_date AS Acquired, a.acquisition_cost AS Cost
               FROM assets a JOIN asset_categories c ON c.id = a.category_id
               LEFT JOIN departments d ON d.id = a.department_id ORDER BY a.asset_tag`,
      allocations: `SELECT a.asset_tag AS Tag, a.name AS Asset, u.name AS Holder, dd.name AS Department,
                           al.allocated_at AS AllocatedAt, al.expected_return_date AS ExpectedReturn,
                           al.returned_at AS ReturnedAt, al.return_condition AS ReturnCondition
                    FROM allocations al JOIN assets a ON a.id = al.asset_id
                    LEFT JOIN users u ON u.id = al.allocated_to_user_id
                    LEFT JOIN departments dd ON dd.id = al.allocated_to_department_id
                    ORDER BY al.allocated_at DESC`,
      maintenance: `SELECT a.asset_tag AS Tag, a.name AS Asset, m.priority AS Priority, m.status AS Status,
                           m.issue_description AS Issue, ru.name AS RaisedBy, m.created_at AS RaisedAt,
                           m.technician_name AS Technician, m.resolved_at AS ResolvedAt
                    FROM maintenance_requests m JOIN assets a ON a.id = m.asset_id
                    JOIN users ru ON ru.id = m.raised_by ORDER BY m.created_at DESC`,
      bookings: `SELECT a.name AS Resource, u.name AS BookedBy, b.starts_at AS Starts, b.ends_at AS Ends,
                        b.status AS Status, b.purpose AS Purpose
                 FROM bookings b JOIN assets a ON a.id = b.asset_id
                 JOIN users u ON u.id = b.booked_by ORDER BY b.starts_at DESC`,
    };
    const sql = queries[req.params.name];
    if (!sql) throw ApiError.notFound(`No export named "${req.params.name}". Available: ${Object.keys(queries).join(', ')}.`);

    const [rows] = await pool.query(sql);
    const headers = rows.length ? Object.keys(rows[0]) : ['(empty)'];
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="assetflow-${req.params.name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    res.send(csv);
  })
);

export default router;
