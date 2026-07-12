const prisma = require('../config/prisma');

/**
 * Persists an activity log entry. Never throws - logging failures must not
 * break the primary request flow.
 */
async function recordActivity({ req, userId, action, entity, entityId, oldData, newData }) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: userId ?? req?.user?.id ?? null,
        action,
        entity,
        entityId: String(entityId),
        oldData: oldData ?? undefined,
        newData: newData ?? undefined,
        ipAddress: req?.ip,
      },
    });
  } catch (err) {
    // swallow - logging is best-effort
    // eslint-disable-next-line no-console
    console.error('Failed to record activity log', err);
  }
}

module.exports = { recordActivity };
