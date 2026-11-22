import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from '../schema';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle, as `db.transaction` passes it to its callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything a repository can run queries on: the database or a transaction. */
export type Executor = Db | Tx;

export function createDb(url: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema, casing: 'snake_case' }), pool };
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Applies pending migrations. Safe to call on every start. */
export function runMigrations(db: Db): Promise<void> {
  return migrate(db, { migrationsFolder });
}

/**
 * How many of this build's migrations the database hasn't applied (all of them on an empty one).
 * Throws when the database can't be reached.
 */
export async function pendingMigrations(db: Executor): Promise<number> {
  // drizzle's migrator records each applied migration's folder timestamp in created_at.
  const found = await db.execute<{ table: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations')::text as table`,
  );
  let last = 0;
  if (found.rows[0]?.table) {
    const { rows } = await db.execute<{ last: string | null }>(
      sql`select max(created_at)::text as last from drizzle.__drizzle_migrations`,
    );
    last = Number(rows[0]?.last ?? 0);
  }
  return readMigrationFiles({ migrationsFolder }).filter((m) => m.folderMillis > last).length;
}
