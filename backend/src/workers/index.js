const cron = require('node-cron');
const logger = require('../utils/logger');
const syncBookingStatuses = require('./bookingStatus.job');
const sendBookingReminders = require('./bookingReminder.job');
const checkOverdueReturns = require('./overdueReturns.job');
const sendAuditReminders = require('./auditReminder.job');

function runSafely(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`[worker:${name}] failed: ${err.message}`);
    }
  };
}

function startWorkers() {
  // Every minute: booking reminders need minute-level precision.
  cron.schedule('* * * * *', runSafely('booking-reminder', sendBookingReminders));

  // Every hour: booking status transitions (Upcoming -> Ongoing -> Completed).
  cron.schedule('0 * * * *', runSafely('booking-status', syncBookingStatuses));

  // Daily at 06:00: overdue returns + audit cycle reminders.
  cron.schedule('0 6 * * *', runSafely('overdue-returns', checkOverdueReturns));
  cron.schedule('0 6 * * *', runSafely('audit-reminder', sendAuditReminders));

  logger.info('Background workers scheduled (booking reminders, status sync, overdue returns, audit reminders)');
}

module.exports = startWorkers;
