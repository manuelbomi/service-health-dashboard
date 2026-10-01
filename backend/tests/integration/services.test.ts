import request from 'supertest';
import { createApp } from '../../src/app';
import { closeDbPool, truncateAll } from '../helpers/testServer';

const app = createApp();

describe('GET /api/services', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('returns the seeded fictional services', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    const slugs = res.body.map((s: { slug: string }) => s.slug);
    expect(slugs).toContain('auth-api');
  });

  it('returns a single service by id', async () => {
    const list = await request(app).get('/api/services');
    const firstId = list.body[0].id;

    const res = await request(app).get(`/api/services/${firstId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(firstId);
  });

  it('returns 404 for a missing service', async () => {
    const res = await request(app).get('/api/services/999999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).get('/api/services/not-a-number');
    expect(res.status).toBe(400);
  });
});
