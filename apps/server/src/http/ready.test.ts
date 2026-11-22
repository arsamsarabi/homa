// /api/ready against a real database, one that's behind on migrations, one that refuses
// connections and one that never answers.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer } from 'node:net';
import { createDb } from '@homa/db';
import { sql } from 'drizzle-orm';
import { freshDb, testDatabaseUrl } from '@/testing';
import { readyApi } from './ready';

const ready = async (api: ReturnType<typeof readyApi>) => {
  const res = await api.request('/ready');
  return { status: res.status, body: (await res.json()) as { status: string; reason?: string } };
};

test('without a database it is not ready', async () => {
  expect(await ready(readyApi())).toEqual({
    status: 503,
    body: { status: 'not-ready', reason: 'the server has no database' },
  });
});

test('a database that refuses connections is not ready', async () => {
  const { db, pool } = createDb('postgres://homa:homa@127.0.0.1:1/homa');
  const r = await ready(readyApi(db));
  await pool.end();
  expect(r).toEqual({ status: 503, body: { status: 'not-ready', reason: 'the database could not be reached' } });
});

test('a database that never answers times out', async () => {
  const silent = createServer(() => {}); // accepts the connection, then says nothing
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const port = (silent.address() as { port: number }).port;
  const { db, pool } = createDb(`postgres://homa:homa@127.0.0.1:${port}/homa`);
  const r = await ready(readyApi(db));
  expect(r.status).toBe(503);
  expect(r.body.reason).toMatch(/did not answer within 2 seconds/);
  pool.end().catch(() => {}); // the stuck connection never closes cleanly
  silent.close();
});

describe.skipIf(!testDatabaseUrl)('with a database', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  beforeAll(async () => {
    t = await freshDb();
  });
  afterAll(() => t.drop());

  test('migrated: ready; a migration behind: not ready', async () => {
    expect(await ready(readyApi(t.db))).toEqual({ status: 200, body: { status: 'ready' } });

    const { rows } = await t.db.execute<{ id: number; hash: string; created_at: string }>(
      sql`select id, hash, created_at::text from drizzle.__drizzle_migrations order by created_at desc limit 1`,
    );
    const last = rows[0];
    if (!last) throw new Error('expected applied migrations');
    await t.db.execute(sql`delete from drizzle.__drizzle_migrations where id = ${last.id}`);
    expect(await ready(readyApi(t.db))).toEqual({
      status: 503,
      body: { status: 'not-ready', reason: '1 database migration(s) not applied yet' },
    });
    await t.db.execute(
      sql`insert into drizzle.__drizzle_migrations (id, hash, created_at) values (${last.id}, ${last.hash}, ${last.created_at})`,
    );
    expect((await ready(readyApi(t.db))).status).toBe(200);
  });
});
