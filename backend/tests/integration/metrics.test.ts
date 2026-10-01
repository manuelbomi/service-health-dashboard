import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db/pool';
import { closeDbPool, truncateAll } from '../helpers/testServer';

const app = createApp();

describe('metrics and alerts history endpoints', () => {
  let serviceId: number;

  beforeEach(async () => {
    await truncateAll();
    const result = await pool.query('SELECT id FROM services ORDER BY id LIMIT 1');
    serviceId = result.rows[0].id;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('records and retrieves metric history ordered newest first', async () => {
    await pool.query(
      `INSERT INTO metric_events (service_id, metric_type, value, recorded_at) VALUES
       ($1, 'latency_ms', 100, now() - interval '2 minutes'),
       ($1, 'latency_ms', 150, now() - interval '1 minute'),
       ($1, 'latency_ms', 120, now())`,
      [serviceId]
    );

    const res = await request(app).get(
      `/api/services/${serviceId}/metrics?metricType=latency_ms`
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].value).toBe(120);
    expect(res.body[2].value).toBe(100);
  });

  it('rejects an invalid metricType', async () => {
    const res = await request(app).get(
      `/api/services/${serviceId}/metrics?metricType=bogus`
    );
    expect(res.status).toBe(400);
  });

  it('filters metric history by sinceMinutes', async () => {
    await pool.query(
      `INSERT INTO metric_events (service_id, metric_type, value, recorded_at) VALUES
       ($1, 'cpu_pct', 10, now() - interval '2 hours'),
       ($1, 'cpu_pct', 20, now())`,
      [serviceId]
    );

    const res = await request(app).get(
      `/api/services/${serviceId}/metrics?metricType=cpu_pct&sinceMinutes=10`
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].value).toBe(20);
  });

  it('records and retrieves alert history', async () => {
    await pool.query(
      `INSERT INTO alerts (service_id, severity, message) VALUES
       ($1, 'critical', 'latency spike')`,
      [serviceId]
    );

    const res = await request(app).get(`/api/services/${serviceId}/alerts`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].severity).toBe('critical');
  });

  it('returns recent alerts across all services', async () => {
    await pool.query(
      `INSERT INTO alerts (service_id, severity, message) VALUES
       ($1, 'warning', 'elevated error rate')`,
      [serviceId]
    );

    const res = await request(app).get('/api/alerts/recent');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
