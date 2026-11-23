// Queries on the auth tables that Better Auth doesn't run itself.
import { count, eq, lt } from 'drizzle-orm';
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

/** The user's role (`admin` or `user`), or undefined for an unknown id. */
export async function findUserRole(db: Executor, id: string): Promise<string | undefined> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  return row?.role;
}
