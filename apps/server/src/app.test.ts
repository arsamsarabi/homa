import { describe, expect, test } from 'bun:test';
import { createApp } from './app';

const app = createApp();

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

  test('unknown /api paths are JSON 404s', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});

describe('serving the web app', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { relative } = await import('node:path');
  const dir = await mkdtemp(`${process.cwd()}/.web-test-`);
  await mkdir(`${dir}/assets`);
  await writeFile(`${dir}/index.html`, '<p>spa</p>');
  await writeFile(`${dir}/assets/app-1234.js`, 'x');
  const web = createApp(undefined, relative(process.cwd(), dir));
  const { rm } = await import('node:fs/promises');
  const { afterAll } = await import('bun:test');
  afterAll(() => rm(dir, { recursive: true }));

  test('client routes fall back to index.html', async () => {
    const res = await web.request('/onboarding');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<p>spa</p>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  test('fingerprinted assets are cached for good', async () => {
    const res = await web.request('/assets/app-1234.js');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  test('the API still wins over the fallback', async () => {
    expect((await web.request('/api/nope')).status).toBe(404);
  });
});
