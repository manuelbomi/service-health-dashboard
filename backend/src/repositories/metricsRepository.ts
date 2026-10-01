import { pool } from '../db/pool';
import { MetricEventRecord, MetricType } from '../types/domain';

export async function insertMetricEvent(
  serviceId: number,
  metricType: MetricType,
  value: number
): Promise<MetricEventRecord> {
  const result = await pool.query<MetricEventRecord>(
    `INSERT INTO metric_events (service_id, metric_type, value)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [serviceId, metricType, value]
  );
  return result.rows[0];
}

export interface MetricHistoryQuery {
  serviceId: number;
  metricType?: MetricType;
  since?: Date;
  limit?: number;
}

// This is the "genuinely optimized" query referenced in the README: it is
// backed entirely by idx_metric_events_service_type_time
// (service_id, metric_type, recorded_at DESC), so Postgres can satisfy the
// WHERE + ORDER BY + LIMIT with a single backward index scan rather than a
// sequential scan followed by a sort. Run EXPLAIN ANALYZE on this query
// against a populated table to confirm "Index Scan" (no "Seq Scan" / "Sort"
// node) -- see README "Optimized query" section.
export async function getMetricHistory({
  serviceId,
  metricType,
  since,
  limit = 500,
}: MetricHistoryQuery): Promise<MetricEventRecord[]> {
  const conditions: string[] = ['service_id = $1'];
  const params: unknown[] = [serviceId];

  if (metricType) {
    params.push(metricType);
    conditions.push(`metric_type = $${params.length}`);
  }
  if (since) {
    params.push(since.toISOString());
    conditions.push(`recorded_at >= $${params.length}`);
  }
  params.push(limit);

  const sql = `
    SELECT * FROM metric_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY recorded_at DESC
    LIMIT $${params.length}
  `;
  const result = await pool.query<MetricEventRecord>(sql, params);
  return result.rows;
}
