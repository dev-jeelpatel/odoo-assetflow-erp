import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { startScheduler } from './jobs/scheduler.js';

const app = createApp();

async function main() {
  await pool.query('SELECT 1'); // fail fast if the database is unreachable
  app.listen(config.port, () => {
    console.log(`AssetFlow API listening on http://localhost:${config.port}`);
    startScheduler();
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
