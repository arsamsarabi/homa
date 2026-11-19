import { expect, test } from 'bun:test';
import { loadConfig } from './config';

const valid = { DATABASE_URL: 'postgres://homa@localhost/homa', BETTER_AUTH_SECRET: 'x'.repeat(32) };

test('defaults fill in the optional settings', () => {
  expect(loadConfig(valid)).toMatchObject({ PORT: 3000, HOMA_ROLE: 'all', HOMA_URL: 'http://localhost:3000' });
});

test('every problem is listed at once', () => {
  expect(() => loadConfig({ BETTER_AUTH_SECRET: 'short', HOMA_ROLE: 'boss' })).toThrow(
    /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET[\s\S]*HOMA_ROLE/,
  );
});
