const prisma = require('../config/prisma');
const { notifyUser } = require('../utils/notify');
const logger = require('../utils/logger');

/**
 * Flags allocations past their expected return date. Sends at most one
 * OVERDUE_RETURN notification per allocation per calendar day.
 */
async function checkOverdueReturns() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdue = await prisma.assetAllocation.findMany({
    where: { returnedAt: null, expectedReturnDate: { lt: now } },
    include: { asset: { select: { name: true, assetTag: true } } },
  });

  for (const allocation of overdue) {
    if (!allocation.employeeId) continue;

    // eslint-disable-next-line no-await-in-loop
    const alreadySentToday = await prisma.notification.findFirst({
      where: {
        type: 'OVERDUE_RETURN',
        referenceId: allocation.id,
        createdAt: { gte: startOfDay },
      },
    });
    if (alreadySentToday) continue;

    // eslint-disable-next-line no-await-in-loop
    await notifyUser({
      userId: allocation.employeeId,
      type: 'OVERDUE_RETURN',
      title: 'Overdue asset return',
      message: `${allocation.asset.name} (${allocation.asset.assetTag}) was due back on ${allocation.expectedReturnDate.toISOString().slice(0, 10)}.`,
      referenceId: allocation.id,
    });
  }

  if (overdue.length) {
    logger.debug(`[overdue-returns] flagged=${overdue.length}`);
  }
}

module.exports = checkOverdueReturns;
