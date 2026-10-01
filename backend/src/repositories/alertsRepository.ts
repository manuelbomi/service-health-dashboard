import { pool } from '../db/pool';
import { AlertRecord, AlertSeverity } from '../types/domain';

export async function insertAlert(
  serviceId: number,
  severity: AlertSeverity,
  message: string
): Promise<AlertRecord> {
  const result = await pool.query<AlertRecord>(
    `INSERT INTO alerts (service_id, severity, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [serviceId, severity, message]
  );
  return result.rows[0];
}

export interface AlertHistoryQuery {
  serviceId: number;
  activeOnly?: boolean;
  limit?: number;
}

export async function getAlertHistory({
  serviceId,
  activeOnly = false,
  limit = 100,
}: AlertHistoryQuery): Promise<AlertRecord[]> {
  const sql = activeOnly
    ? `SELECT * FROM alerts WHERE service_id = $1 AND resolved_at IS NULL
       ORDER BY triggered_at DESC LIMIT $2`
    : `SELECT * FROM alerts WHERE service_id = $1
       ORDER BY triggered_at DESC LIMIT $2`;
  const result = await pool.query<AlertRecord>(sql, [serviceId, limit]);
  return result.rows;
}

export async function getRecentAlertsAcrossServices(
  limit = 50
): Promise<AlertRecord[]> {
  const result = await pool.query<AlertRecord>(
    `SELECT * FROM alerts ORDER BY triggered_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}
