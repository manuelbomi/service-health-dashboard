import { Pool } from 'pg';
import { env } from '../config/env';

// A single shared pool for the whole process. pg handles checkout/checkin
// of connections internally; we just need to size it sensibly for the
// workload (API requests + the background simulator share this pool).
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // Idle clients can be dropped by the server (e.g. a restart); log and let
  // the pool recreate connections lazily rather than crashing the process.
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle PG client', err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
