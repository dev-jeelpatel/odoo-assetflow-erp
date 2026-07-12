import { pool } from '../db/pool.js';
import { pushToUser, broadcast } from './sse.js';

/**
 * Create a notification row and push it live over SSE.
 * `conn` lets callers write inside their own transaction.
 */
export async function notify(userId, { type, title, body = null, entityType = null, entityId = null }, conn = pool) {
  if (!userId) return;
  const [result] = await conn.query(
    `INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, body, entityType, entityId]
  );
  pushToUser(userId, 'notification', {
    id: result.insertId, type, title, body,
    entity_type: entityType, entity_id: entityId,
    read_at: null, created_at: new Date().toISOString(),
  });
}

export async function notifyMany(userIds, payload, conn = pool) {
  const unique = [...new Set(userIds.filter(Boolean).map(Number))];
  for (const id of unique) await notify(id, payload, conn);
}

/** Notify every active user holding one of the given roles. */
export async function notifyRole(roles, payload, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id FROM users WHERE role IN (?) AND status = 'ACTIVE'`,
    [roles]
  );
  await notifyMany(rows.map((r) => r.id), payload, conn);
}

/** Tell all connected dashboards their KPIs are stale. */
export function invalidateKpis() {
  broadcast('kpi-invalidate', { at: Date.now() });
}
