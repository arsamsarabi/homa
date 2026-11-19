import { type Db, schema } from '@homa/db';
import { lt } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { extendHorizon } from './calendar/service';

export const PURGE_AUTH = 'maintenance.purge-auth';
export const EXTEND_HORIZON = 'calendar.extend-horizon';

/** Deletes expired sessions and verification tokens. Returns how many rows went. */
export async function purgeExpiredAuth(db: Db, now = new Date()) {
  const s = await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, now))
    .returning({ id: schema.sessions.id });
  const v = await db
    .delete(schema.verifications)
    .where(lt(schema.verifications.expiresAt, now))
    .returning({ id: schema.verifications.id });
  return { sessions: s.length, verifications: v.length };
}

export async function startWorker(databaseUrl: string, db: Db) {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (err) => console.error('pg-boss:', err));
  await boss.start();
  await boss.createQueue(PURGE_AUTH);
  await boss.schedule(PURGE_AUTH, '17 3 * * *'); // daily, 03:17 UTC
  await boss.work(PURGE_AUTH, async () => {
    const purged = await purgeExpiredAuth(db);
    console.log(`${PURGE_AUTH}:`, purged);
  });
  await boss.createQueue(EXTEND_HORIZON);
  await boss.schedule(EXTEND_HORIZON, '41 2 * * *'); // daily, 02:41 UTC
  await boss.work(EXTEND_HORIZON, async () => {
    console.log(`${EXTEND_HORIZON}: re-expanded`, await extendHorizon(db), 'events');
  });
  return boss;
}
