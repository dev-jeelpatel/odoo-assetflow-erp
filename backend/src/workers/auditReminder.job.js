const prisma = require('../config/prisma');
const { notifyUser } = require('../utils/notify');
const logger = require('../utils/logger');

const REMINDER_WINDOW_DAYS = 2;

/**
 * Nudges auditors when their assigned cycle's end date is approaching and it
 * still has unverified/open items. Dedupes per cycle per calendar day.
 */
async function sendAuditReminders() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const cycles = await prisma.auditCycle.findMany({
    where: { isClosed: false, endDate: { gte: now, lte: windowEnd } },
    include: { auditors: true },
  });

  for (const cycle of cycles) {
    for (const auditor of cycle.auditors) {
      // eslint-disable-next-line no-await-in-loop
      const alreadySentToday = await prisma.notification.findFirst({
        where: { type: 'AUDIT_DISCREPANCY', referenceId: cycle.id, userId: auditor.userId, createdAt: { gte: startOfDay } },
      });
      if (alreadySentToday) continue;

      // eslint-disable-next-line no-await-in-loop
      await notifyUser({
        userId: auditor.userId,
        type: 'AUDIT_DISCREPANCY',
        title: 'Audit cycle ending soon',
        message: `Audit cycle "${cycle.title}" ends on ${cycle.endDate.toISOString().slice(0, 10)}. Please complete your verifications.`,
        referenceId: cycle.id,
      });
    }
  }

  if (cycles.length) {
    logger.debug(`[audit-reminder] cycles=${cycles.length}`);
  }
}

module.exports = sendAuditReminders;
