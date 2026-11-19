import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

export { schema };
export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema, casing: 'snake_case' }), pool };
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applies pending migrations. Safe to call on every start. */
export function runMigrations(db: Db) {
  return migrate(db, { migrationsFolder });
}
