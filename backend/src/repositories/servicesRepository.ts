import { pool } from '../db/pool';
import { ServiceRecord } from '../types/domain';

export async function listServices(): Promise<ServiceRecord[]> {
  const result = await pool.query<ServiceRecord>(
    'SELECT * FROM services ORDER BY id ASC'
  );
  return result.rows;
}

export async function getServiceById(
  id: number
): Promise<ServiceRecord | null> {
  const result = await pool.query<ServiceRecord>(
    'SELECT * FROM services WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listServiceIds(): Promise<number[]> {
  const result = await pool.query<{ id: number }>('SELECT id FROM services');
  return result.rows.map((r) => r.id);
}
