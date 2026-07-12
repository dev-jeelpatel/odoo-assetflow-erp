const prisma = require('../config/prisma');
const logger = require('../utils/logger');

/**
 * Advances booking lifecycle purely from wall-clock time: UPCOMING -> ONGOING
 * once startTime passes, ONGOING -> COMPLETED once endTime passes.
 */
async function syncBookingStatuses() {
  const now = new Date();

  const [startedCount, endedCount] = await Promise.all([
    prisma.resourceBooking.updateMany({
      where: { status: 'UPCOMING', startTime: { lte: now }, endTime: { gt: now } },
      data: { status: 'ONGOING' },
    }),
    prisma.resourceBooking.updateMany({
      where: { status: { in: ['UPCOMING', 'ONGOING'] }, endTime: { lte: now } },
      data: { status: 'COMPLETED' },
    }),
  ]);

  if (startedCount.count || endedCount.count) {
    logger.debug(`[booking-status] started=${startedCount.count} completed=${endedCount.count}`);
  }
}

module.exports = syncBookingStatuses;
