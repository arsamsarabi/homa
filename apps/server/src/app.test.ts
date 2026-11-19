import { describe, expect, test } from 'bun:test';
import { app } from './app';

describe('api', () => {
  test('GET /api/health answers ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });

  test('GET /api/openapi.json describes the health route', async () => {
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toContain('/health');
  });
});
