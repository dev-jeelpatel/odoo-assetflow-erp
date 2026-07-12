import { pool } from '../db/pool.js';

/**
 * Append one row to the immutable who-did-what-when trail.
 * Every state-changing service method calls this.
 */
export async function logActivity(
  { actorId = null, action, entityType, entityId = null, summary, metadata = null },
  conn = pool
) {
  await conn.query(
    `INSERT INTO activity_logs (actor_user_id, action, entity_type, entity_id, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, entityType, entityId, summary, metadata ? JSON.stringify(metadata) : null]
  );
}
