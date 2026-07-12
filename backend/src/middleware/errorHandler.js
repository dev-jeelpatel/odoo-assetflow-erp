const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.isApiError) {
    return res.status(err.statusCode).json({
      message: err.message,
      details: err.details,
    });
  }

  if (err.code && err.code.startsWith('P')) {
    // Prisma error codes
    if (err.code === 'P2002') {
      return res.status(409).json({
        message: `Duplicate value for unique field: ${err.meta?.target}`,
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Record not found' });
    }
  }

  logger.error(err.stack || err.message);
  res.status(500).json({ message: 'Internal server error' });
}

module.exports = { notFoundHandler, errorHandler };
