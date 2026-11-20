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

test('connected-calendar settings: an optional 32-byte key, the interval and the private-network flag', () => {
  expect(loadConfig(valid).HOMA_ENCRYPTION_KEY).toBeUndefined();
  expect(loadConfig({ ...valid, HOMA_ENCRYPTION_KEY: '' }).HOMA_ENCRYPTION_KEY).toBeUndefined();
  expect(loadConfig(valid)).toMatchObject({
    HOMA_SYNC_INTERVAL_MINUTES: 30,
    HOMA_SYNC_ALLOW_PRIVATE_NETWORKS: false,
  });
  const key = Buffer.alloc(32, 7).toString('base64');
  expect(
    loadConfig({
      ...valid,
      HOMA_ENCRYPTION_KEY: key,
      HOMA_SYNC_INTERVAL_MINUTES: '60',
      HOMA_SYNC_ALLOW_PRIVATE_NETWORKS: 'true',
    }),
  ).toMatchObject({ HOMA_ENCRYPTION_KEY: key, HOMA_SYNC_INTERVAL_MINUTES: 60, HOMA_SYNC_ALLOW_PRIVATE_NETWORKS: true });
  expect(() => loadConfig({ ...valid, HOMA_ENCRYPTION_KEY: 'short' })).toThrow(/HOMA_ENCRYPTION_KEY must be 32 bytes/);
  expect(() => loadConfig({ ...valid, HOMA_SYNC_INTERVAL_MINUTES: '1' })).toThrow(/HOMA_SYNC_INTERVAL_MINUTES/);
});

test('the Google OAuth client: both values or neither', () => {
  expect(loadConfig({ ...valid, HOMA_GOOGLE_CLIENT_ID: '', HOMA_GOOGLE_CLIENT_SECRET: '' })).toMatchObject({
    HOMA_GOOGLE_CLIENT_ID: undefined,
    HOMA_GOOGLE_CLIENT_SECRET: undefined,
  });
  expect(
    loadConfig({ ...valid, HOMA_GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', HOMA_GOOGLE_CLIENT_SECRET: 's' }),
  ).toMatchObject({ HOMA_GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', HOMA_GOOGLE_CLIENT_SECRET: 's' });
  expect(() => loadConfig({ ...valid, HOMA_GOOGLE_CLIENT_ID: 'id' })).toThrow(/HOMA_GOOGLE_CLIENT_SECRET: set both/);
});

test('the Microsoft app: both values or neither', () => {
  expect(loadConfig({ ...valid, HOMA_MICROSOFT_CLIENT_ID: '', HOMA_MICROSOFT_CLIENT_SECRET: '' })).toMatchObject({
    HOMA_MICROSOFT_CLIENT_ID: undefined,
    HOMA_MICROSOFT_CLIENT_SECRET: undefined,
  });
  expect(() => loadConfig({ ...valid, HOMA_MICROSOFT_CLIENT_ID: 'id' })).toThrow(
    /HOMA_MICROSOFT_CLIENT_SECRET: set both/,
  );
});
