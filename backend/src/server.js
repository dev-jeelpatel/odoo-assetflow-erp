const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const logger = require('./utils/logger');
const startWorkers = require('./workers');

const server = app.listen(env.port, () => {
  logger.info(`AssetFlow API listening on port ${env.port} [${env.nodeEnv}]`);
});

if (env.nodeEnv !== 'test') {
  startWorkers();
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
