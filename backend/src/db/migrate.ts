import fs from 'fs';
import path from 'path';
import { pool } from './pool';

// Minimal, dependency-free migration runner: every .sql file in
// db/migrations is applied once, in filename order, and recorded in
// schema_migrations. No down-migrations are generated automatically --
// instead each migration file has a matching ".down.sql" file used only
// when `migrate:down` is invoked for the most recently applied migration.

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function listUpMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
}

async function up(): Promise<void> {
  await ensureMigrationsTable();
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map(
      (r) => r.name
    )
  );

  for (const file of listUpMigrations()) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        file,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('Migrations up to date.');
}

async function down(): Promise<void> {
  await ensureMigrationsTable();
  const result = await pool.query(
    'SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1'
  );
  if (result.rows.length === 0) {
    console.log('No migrations to roll back.');
    return;
  }
  const last: string = result.rows[0].name;
  const downFile = last.replace(/\.sql$/, '.down.sql');
  const downPath = path.join(MIGRATIONS_DIR, downFile);
  if (!fs.existsSync(downPath)) {
    throw new Error(`No down migration found for ${last} (expected ${downFile})`);
  }
  const sql = fs.readFileSync(downPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE name = $1', [last]);
    await client.query('COMMIT');
    console.log(`Rolled back migration: ${last}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const direction = process.argv[2] ?? 'up';
  if (direction === 'up') {
    await up();
  } else if (direction === 'down') {
    await down();
  } else {
    throw new Error(`Unknown migration direction: ${direction}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
