// The outbox of local changes waiting to be pushed to two-way calendars. One row per remote
// resource (calendar + UID): enqueueing again replaces the pending op and bumps its version, so a
// push only finishes the version it sent.
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { type OutboxKind, outbox } from '../schema';

export type OutboxRow = typeof outbox.$inferSelect;
export type OutboxValues = {
  connectionId: string;
  calendarId: string;
  uid: string;
  kind: OutboxKind;
  eventId: string | null;
  href: string | null;
  etag: string | null;
};

/** Adds the op, or replaces the pending one for the same resource (due now, attempts reset). */
export async function enqueueOutbox(db: Executor, values: OutboxValues): Promise<void> {
  const { connectionId: _c, calendarId: _k, uid: _u, ...change } = values;
  await db
    .insert(outbox)
    .values(values)
    .onConflictDoUpdate({
      target: [outbox.calendarId, outbox.uid],
      set: {
        ...change,
        version: sql`${outbox.version} + 1`,
        attempts: 0,
        nextAttemptAt: sql`now()`,
        lastError: null,
      },
    });
}

/** Drops the pending ops for these UIDs in the calendar (the remote won, or there's nothing to send). */
export async function dropOutbox(db: Executor, calendarId: string, uids: readonly string[]): Promise<void> {
  if (uids.length)
    await db.delete(outbox).where(and(eq(outbox.calendarId, calendarId), inArray(outbox.uid, [...uids])));
}

/** UIDs with a pending op in the calendar. */
export async function pendingOutboxUids(db: Executor, calendarId: string): Promise<Set<string>> {
  const rows = await db.select({ uid: outbox.uid }).from(outbox).where(eq(outbox.calendarId, calendarId));
  return new Set(rows.map((r) => r.uid));
}

/** The connection's ops due by `now`, oldest first. */
export const listDueOutbox = (db: Executor, connectionId: string, now: Date, limit: number): Promise<OutboxRow[]> =>
  db
    .select()
    .from(outbox)
    .where(and(eq(outbox.connectionId, connectionId), lte(outbox.nextAttemptAt, now)))
    .orderBy(asc(outbox.createdAt), asc(outbox.id))
    .limit(limit);

/** Connections with an op due by `now`. */
export const listOutboxConnections = (db: Executor, now: Date, limit: number): Promise<{ id: string }[]> =>
  db.selectDistinct({ id: outbox.connectionId }).from(outbox).where(lte(outbox.nextAttemptAt, now)).limit(limit);

/** Removes the op if it is still the version that was pushed. */
export async function completeOutbox(db: Executor, id: string, version: number): Promise<void> {
  await db.delete(outbox).where(and(eq(outbox.id, id), eq(outbox.version, version)));
}

/** Schedules another try of this version of the op. */
export async function deferOutbox(
  db: Executor,
  id: string,
  version: number,
  retry: { attempts: number; nextAttemptAt: Date; lastError: string },
): Promise<void> {
  await db
    .update(outbox)
    .set(retry)
    .where(and(eq(outbox.id, id), eq(outbox.version, version)));
}
