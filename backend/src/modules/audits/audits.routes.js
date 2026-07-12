import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { notify, notifyRole, invalidateKpis } from '../../utils/notify.js';
import { assertTransition } from '../../utils/stateMachine.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  catchAsync(async (req, res) => {
    const filters = [];
    const vals = [];
    // Auditors (any role) see cycles assigned to them; managers/admins see all.
    if (!['ADMIN', 'ASSET_MANAGER'].includes(req.user.role)) {
      filters.push('EXISTS (SELECT 1 FROM audit_assignments aa WHERE aa.cycle_id = c.id AND aa.auditor_user_id = ?)');
      vals.push(req.user.id);
    }
    if (req.query.status) { filters.push('c.status = ?'); vals.push(req.query.status); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT c.*, d.name AS scope_department_name, cu.name AS created_by_name,
              (SELECT COUNT(*) FROM audit_items i WHERE i.cycle_id = c.id) AS item_count,
              (SELECT COUNT(*) FROM audit_items i WHERE i.cycle_id = c.id AND i.verification != 'PENDING') AS done_count,
              (SELECT COUNT(*) FROM audit_items i WHERE i.cycle_id = c.id AND i.verification IN ('MISSING','DAMAGED')) AS flagged_count
       FROM audit_cycles c
       LEFT JOIN departments d ON d.id = c.scope_department_id
       JOIN users cu ON cu.id = c.created_by
       ${where} ORDER BY c.created_at DESC`,
      vals
    );
    res.json({ data: rows });
  })
);

// Create a cycle: snapshots every in-scope asset into audit_items.
router.post(
  '/',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({
    body: z
      .object({
        name: z.string().trim().min(3, 'Give the cycle a name').max(160),
        scope_department_id: z.coerce.number().int().positive().nullable().optional(),
        scope_location: z.string().trim().max(160).nullable().optional(),
        starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        auditor_ids: z.array(z.coerce.number().int().positive()).min(1, 'Assign at least one auditor'),
      })
      .refine((b) => b.ends_on >= b.starts_on, { message: 'End date must be on or after start date.', path: ['ends_on'] }),
  }),
  catchAsync(async (req, res) => {
    const b = req.body;
    const created = await withTransaction(async (conn) => {
      // Snapshot the in-scope assets (excluding already-disposed ones).
      const scopeFilters = [`a.status != 'DISPOSED'`];
      const scopeVals = [];
      if (b.scope_department_id) { scopeFilters.push('a.department_id = ?'); scopeVals.push(b.scope_department_id); }
      if (b.scope_location) { scopeFilters.push('a.location LIKE ?'); scopeVals.push(`%${b.scope_location}%`); }
      const [assets] = await conn.query(
        `SELECT a.id, a.location FROM assets a WHERE ${scopeFilters.join(' AND ')}`,
        scopeVals
      );
      if (!assets.length) {
        throw ApiError.badRequest('No assets match this scope — widen the department/location.');
      }

      const [result] = await conn.query(
        `INSERT INTO audit_cycles (name, scope_department_id, scope_location, starts_on, ends_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [b.name, b.scope_department_id ?? null, b.scope_location ?? null, b.starts_on, b.ends_on, req.user.id]
      );
      const cycleId = result.insertId;

      for (const id of b.auditor_ids) {
        await conn.query('INSERT INTO audit_assignments (cycle_id, auditor_user_id) VALUES (?, ?)', [cycleId, id]);
      }
      const itemRows = assets.map((a) => [cycleId, a.id, a.location]);
      await conn.query('INSERT INTO audit_items (cycle_id, asset_id, expected_location) VALUES ?', [itemRows]);

      await logActivity({
        actorId: req.user.id, action: 'AUDIT_CREATED', entityType: 'audit', entityId: cycleId,
        summary: `Audit cycle "${b.name}" opened with ${assets.length} assets`,
      }, conn);
      for (const id of b.auditor_ids) {
        await notify(id, {
          type: 'AUDIT_ASSIGNED',
          title: `You are an auditor on "${b.name}"`,
          body: `${assets.length} assets to verify between ${b.starts_on} and ${b.ends_on}`,
          entityType: 'audit', entityId: cycleId,
        }, conn);
      }
      return { id: cycleId, item_count: assets.length };
    });
    res.status(201).json({ data: created });
  })
);

router.get(
  '/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [cycles] = await pool.query(
      `SELECT c.*, d.name AS scope_department_name, cu.name AS created_by_name
       FROM audit_cycles c
       LEFT JOIN departments d ON d.id = c.scope_department_id
       JOIN users cu ON cu.id = c.created_by WHERE c.id = ?`,
      [req.params.id]
    );
    const cycle = cycles[0];
    if (!cycle) throw ApiError.notFound('Audit cycle not found.');

    const [auditors] = await pool.query(
      `SELECT u.id, u.name FROM audit_assignments aa JOIN users u ON u.id = aa.auditor_user_id WHERE aa.cycle_id = ?`,
      [cycle.id]
    );
    const [items] = await pool.query(
      `SELECT i.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status, vu.name AS verified_by_name
       FROM audit_items i
       JOIN assets a ON a.id = i.asset_id
       LEFT JOIN users vu ON vu.id = i.verified_by
       WHERE i.cycle_id = ? ORDER BY a.asset_tag`,
      [cycle.id]
    );
    res.json({ data: { ...cycle, auditors, items } });
  })
);

// Auditor marks one item.
router.patch(
  '/:id/items/:itemId',
  validate({
    params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }),
    body: z.object({
      verification: z.enum(['VERIFIED', 'MISSING', 'DAMAGED']),
      notes: z.string().trim().max(500).optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const [cycles] = await pool.query('SELECT * FROM audit_cycles WHERE id = ?', [req.params.id]);
    const cycle = cycles[0];
    if (!cycle) throw ApiError.notFound('Audit cycle not found.');
    if (cycle.status === 'CLOSED') {
      throw ApiError.conflict('CYCLE_LOCKED', 'This audit cycle is closed — its results are locked.');
    }

    const isManager = ['ADMIN', 'ASSET_MANAGER'].includes(req.user.role);
    const [assigned] = await pool.query(
      'SELECT id FROM audit_assignments WHERE cycle_id = ? AND auditor_user_id = ?',
      [cycle.id, req.user.id]
    );
    if (!isManager && !assigned.length) {
      throw ApiError.forbidden('Only assigned auditors can verify assets in this cycle.');
    }

    const [items] = await pool.query(
      `SELECT i.*, a.asset_tag FROM audit_items i JOIN assets a ON a.id = i.asset_id
       WHERE i.id = ? AND i.cycle_id = ?`,
      [req.params.itemId, cycle.id]
    );
    const item = items[0];
    if (!item) throw ApiError.notFound('Audit item not found in this cycle.');

    await pool.query(
      `UPDATE audit_items SET verification = ?, notes = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
      [req.body.verification, req.body.notes ?? null, req.user.id, item.id]
    );
    await logActivity({
      actorId: req.user.id, action: 'AUDIT_ITEM_MARKED', entityType: 'audit', entityId: cycle.id,
      summary: `${item.asset_tag} marked ${req.body.verification.toLowerCase()} in "${cycle.name}"`,
    });
    if (req.body.verification !== 'VERIFIED') {
      await notifyRole(['ASSET_MANAGER', 'ADMIN'], {
        type: 'AUDIT_DISCREPANCY',
        title: `Audit discrepancy: ${item.asset_tag} ${req.body.verification.toLowerCase()}`,
        body: req.body.notes || `Flagged in cycle "${cycle.name}"`,
        entityType: 'audit', entityId: cycle.id,
      });
    }
    res.json({ data: { id: item.id, verification: req.body.verification } });
  })
);

// The discrepancy report is always computed from item rows — never hand-written.
router.get(
  '/:id/discrepancy-report',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const [cycles] = await pool.query('SELECT * FROM audit_cycles WHERE id = ?', [req.params.id]);
    if (!cycles.length) throw ApiError.notFound('Audit cycle not found.');

    const [rows] = await pool.query(
      `SELECT i.verification, i.notes, i.verified_at, i.expected_location,
              a.asset_tag, a.name AS asset_name, a.status AS asset_status, a.location,
              vu.name AS verified_by_name
       FROM audit_items i
       JOIN assets a ON a.id = i.asset_id
       LEFT JOIN users vu ON vu.id = i.verified_by
       WHERE i.cycle_id = ? AND i.verification IN ('MISSING','DAMAGED','PENDING')
       ORDER BY FIELD(i.verification,'MISSING','DAMAGED','PENDING'), a.asset_tag`,
      [req.params.id]
    );
    const summary = {
      missing: rows.filter((r) => r.verification === 'MISSING').length,
      damaged: rows.filter((r) => r.verification === 'DAMAGED').length,
      unverified: rows.filter((r) => r.verification === 'PENDING').length,
    };
    res.json({ data: { cycle: cycles[0], summary, discrepancies: rows } });
  })
);

// Close: lock the cycle and apply consequences (confirmed missing → LOST).
router.post(
  '/:id/close',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  catchAsync(async (req, res) => {
    const outcome = await withTransaction(async (conn) => {
      const [cycles] = await conn.query('SELECT * FROM audit_cycles WHERE id = ? FOR UPDATE', [req.params.id]);
      const cycle = cycles[0];
      if (!cycle) throw ApiError.notFound('Audit cycle not found.');
      if (cycle.status === 'CLOSED') throw ApiError.conflict('CYCLE_LOCKED', 'This cycle is already closed.');

      const [flagged] = await conn.query(
        `SELECT i.*, a.asset_tag, a.status AS asset_status, a.cond
         FROM audit_items i JOIN assets a ON a.id = i.asset_id
         WHERE i.cycle_id = ? AND i.verification IN ('MISSING','DAMAGED')`,
        [cycle.id]
      );

      let lostCount = 0;
      for (const item of flagged) {
        if (item.verification === 'MISSING') {
          // Only statuses that legally lead to LOST get updated.
          if ((await legalToLost(item.asset_status))) {
            await conn.query(`UPDATE assets SET status = 'LOST' WHERE id = ?`, [item.asset_id]);
            // A lost asset can't stay allocated to anyone.
            await conn.query(
              `UPDATE allocations SET returned_at = NOW(), return_condition_notes = 'Confirmed missing in audit' WHERE asset_id = ? AND returned_at IS NULL`,
              [item.asset_id]
            );
            lostCount++;
          }
        } else if (item.verification === 'DAMAGED') {
          await conn.query(`UPDATE assets SET cond = 'POOR' WHERE id = ?`, [item.asset_id]);
        }
      }

      await conn.query(
        `UPDATE audit_cycles SET status = 'CLOSED', closed_by = ?, closed_at = NOW() WHERE id = ?`,
        [req.user.id, cycle.id]
      );
      await logActivity({
        actorId: req.user.id, action: 'AUDIT_CLOSED', entityType: 'audit', entityId: cycle.id,
        summary: `Audit "${cycle.name}" closed — ${flagged.length} discrepancies, ${lostCount} asset(s) marked Lost`,
      }, conn);
      return { flagged: flagged.length, marked_lost: lostCount };
    });

    invalidateKpis();
    res.json({ data: { id: Number(req.params.id), status: 'CLOSED', ...outcome } });
  })
);

async function legalToLost(fromStatus) {
  try {
    assertTransition(fromStatus, 'LOST');
    return true;
  } catch {
    return false;
  }
}

export default router;
