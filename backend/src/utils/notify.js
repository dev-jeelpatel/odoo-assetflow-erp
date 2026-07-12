const prisma = require('../config/prisma');

/**
 * Creates an in-app notification for a user. Best-effort - never throws.
 */
async function notifyUser({ userId, type, title, message, referenceId }) {
  try {
    return await prisma.notification.create({
      data: { userId, type, title, message, referenceId: referenceId ? String(referenceId) : undefined },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to create notification', err);
    return null;
  }
}

module.exports = { notifyUser };
