const logger = require('./logger');

/**
 * Stub mail sender. Swap for a real provider (SES/SendGrid/etc) later —
 * every call site only depends on this function's signature.
 */
async function sendMail({ to, subject, text }) {
  logger.info(`[mailer] To: ${to} | Subject: ${subject}\n${text}`);
  return true;
}

module.exports = { sendMail };
