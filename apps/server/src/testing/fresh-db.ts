// Test helper: a fresh, migrated database per test file on the Postgres in TEST_DATABASE_URL.
// Without TEST_DATABASE_URL the integration tests are skipped.
import { createDb, type Db, runMigrations } from '@homa/db';
import { Client } from 'pg';

export const testDatabaseUrl: string | undefined = process.env.TEST_DATABASE_URL;

export type FreshDb = { db: Db; url: string; drop: () => Promise<void> };

export async function freshDb(): Promise<FreshDb> {
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is not set');
  const name = `homa_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString());
  // pool.end() can resolve before its connections have closed, and DROP … WITH (FORCE) then
  // terminates them (57P01, admin_shutdown); without a listener that surfaced as an unhandled
  // error between tests. Only that error, and only while dropping, is expected.
  let dropping = false;
  const onError = (err: Error & { code?: string }): void => {
    if (!(dropping && err.code === '57P01')) throw err;
  };
  pool.on('error', onError);
  pool.on('connect', (client) => client.on('error', onError));
  await runMigrations(db);
  return {
    db,
    url: url.toString(),
    async drop(): Promise<void> {
      dropping = true;
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
