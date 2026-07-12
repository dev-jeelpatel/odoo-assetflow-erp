const prisma = require('../config/prisma');
const { notifyUser } = require('../utils/notify');
const logger = require('../utils/logger');

const REMINDER_WINDOW_MINUTES = 30;

/**
 * Notifies the booker shortly before a slot starts. Dedupes by checking
 * whether a BOOKING_REMINDER notification already references this booking.
 */
async function sendBookingReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  const upcoming = await prisma.resourceBooking.findMany({
    where: { status: 'UPCOMING', startTime: { gte: now, lte: windowEnd } },
    include: { asset: { select: { name: true, assetTag: true } } },
  });

  for (const booking of upcoming) {
    // eslint-disable-next-line no-await-in-loop
    const alreadySent = await prisma.notification.findFirst({
      where: { type: 'BOOKING_REMINDER', referenceId: booking.id },
    });
    if (alreadySent) continue;

    // eslint-disable-next-line no-await-in-loop
    await notifyUser({
      userId: booking.bookedById,
      type: 'BOOKING_REMINDER',
      title: 'Upcoming booking reminder',
      message: `Your booking for ${booking.asset.name} (${booking.asset.assetTag}) starts at ${booking.startTime.toISOString()}.`,
      referenceId: booking.id,
    });
  }

  if (upcoming.length) {
    logger.debug(`[booking-reminder] checked=${upcoming.length}`);
  }
}

module.exports = sendBookingReminders;
