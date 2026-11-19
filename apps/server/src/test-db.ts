// Test helper: a fresh, migrated database per test file on the Postgres in TEST_DATABASE_URL.
// Without TEST_DATABASE_URL the integration tests are skipped.
import { createDb, runMigrations } from '@homa/db';
import { Client } from 'pg';

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export async function freshDb() {
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is not set');
  const name = `homa_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString());
  await runMigrations(db);
  return {
    db,
    url: url.toString(),
    async drop() {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
