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

test('VAPID keys come in pairs, and the subject is a mailto: or https: URL', () => {
  expect(() => loadConfig({ ...valid, HOMA_VAPID_PUBLIC_KEY: 'pub' })).toThrow(/HOMA_VAPID_PRIVATE_KEY: set both/);
  expect(() => loadConfig({ ...valid, HOMA_VAPID_SUBJECT: 'admin@example.com' })).toThrow(/HOMA_VAPID_SUBJECT/);
  expect(loadConfig({ ...valid, HOMA_VAPID_SUBJECT: 'mailto:admin@example.com' })).toMatchObject({
    HOMA_VAPID_SUBJECT: 'mailto:admin@example.com',
    HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS: false,
  });
});

test('email: HOMA_SMTP_URL and HOMA_MAIL_FROM together, or neither', () => {
  expect(loadConfig({ ...valid, HOMA_SMTP_URL: '', HOMA_MAIL_FROM: '' }).HOMA_SMTP_URL).toBeUndefined();
  expect(() => loadConfig({ ...valid, HOMA_SMTP_URL: 'smtp://mail.example.com:587' })).toThrow(/HOMA_MAIL_FROM/);
  expect(() => loadConfig({ ...valid, HOMA_SMTP_URL: 'http://mail', HOMA_MAIL_FROM: 'x' })).toThrow(/smtp:\/\//);
});

test('email verification: on by default with email, off without, and true needs email', () => {
  const mail = { ...valid, HOMA_SMTP_URL: 'smtp://mail.example.com:587', HOMA_MAIL_FROM: 'Homa <h@example.com>' };
  expect(loadConfig(valid).HOMA_REQUIRE_EMAIL_VERIFICATION).toBe(false);
  expect(loadConfig(mail).HOMA_REQUIRE_EMAIL_VERIFICATION).toBe(true);
  expect(loadConfig({ ...mail, HOMA_REQUIRE_EMAIL_VERIFICATION: 'false' }).HOMA_REQUIRE_EMAIL_VERIFICATION).toBe(false);
  expect(loadConfig({ ...valid, HOMA_REQUIRE_EMAIL_VERIFICATION: '' }).HOMA_REQUIRE_EMAIL_VERIFICATION).toBe(false);
  expect(() => loadConfig({ ...valid, HOMA_REQUIRE_EMAIL_VERIFICATION: 'true' })).toThrow(
    /HOMA_REQUIRE_EMAIL_VERIFICATION=true needs email/,
  );
});

test('demo mode: off by default, and refuses settings that send anything out', () => {
  expect(loadConfig(valid).HOMA_DEMO).toBe(false);
  expect(loadConfig({ ...valid, HOMA_DEMO: 'true' }).HOMA_DEMO).toBe(true);
  expect(() =>
    loadConfig({ ...valid, HOMA_DEMO: 'true', HOMA_SMTP_URL: 'smtp://h:587', HOMA_MAIL_FROM: 'a@example.com' }),
  ).toThrow(/HOMA_DEMO/);
  expect(() =>
    loadConfig({ ...valid, HOMA_DEMO: 'true', HOMA_GOOGLE_CLIENT_ID: 'id', HOMA_GOOGLE_CLIENT_SECRET: 's' }),
  ).toThrow(/HOMA_DEMO/);
});
