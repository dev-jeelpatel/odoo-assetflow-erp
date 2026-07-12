/**
 * Minimal migration runner: applies db/migrations/*.sql in filename order,
 * tracking applied files in schema_migrations. Creates the database if missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'db', 'migrations');

async function main() {
  const admin = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await admin.query(`USE \`${config.db.database}\``);
  await admin.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  const [appliedRows] = await admin.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    await admin.query(sql);
    await admin.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    ran++;
  }
  console.log(ran ? `Applied ${ran} migration(s).` : 'Database is up to date.');
  await admin.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
