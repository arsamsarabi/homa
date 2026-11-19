// Queries on the auth tables that Better Auth doesn't run itself.
import { count, lt } from 'drizzle-orm';
import type { Executor } from '../client';
import { sessions, users, verifications } from '../schema';

export async function countUsers(db: Executor): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

/** Deletes sessions and verification tokens that expired before `now`. Returns how many rows went. */
export async function deleteExpiredAuth(db: Executor, now: Date): Promise<{ sessions: number; verifications: number }> {
  const s = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  const v = await db.delete(verifications).where(lt(verifications.expiresAt, now)).returning({ id: verifications.id });
  return { sessions: s.length, verifications: v.length };
}
