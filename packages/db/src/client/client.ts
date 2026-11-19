import { fileURLToPath } from 'node:url';
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
