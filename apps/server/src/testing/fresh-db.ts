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
  // DROP ... WITH (FORCE) below kills any connection still open (e.g. one Better Auth hands back
  // late after a rejected sign-up); that's intended, so don't let it surface as an unhandled error.
  pool.on('error', () => {});
  await runMigrations(db);
  return {
    db,
    url: url.toString(),
    async drop(): Promise<void> {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
