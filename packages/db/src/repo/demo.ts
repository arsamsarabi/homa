// The demo instance's nightly reset: every account and everything they own goes.
import { sql } from 'drizzle-orm';
import type { Executor } from '../client';

/**
 * Deletes every account and, through the foreign keys, every row an account owns, plus the
 * verification tokens. Instance settings and the migrations stay. Only for HOMA_DEMO instances.
 */
export async function wipeAllAccounts(db: Executor): Promise<void> {
  await db.execute(sql`TRUNCATE users, verifications CASCADE`);
}
