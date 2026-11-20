// Calendars, always filtered by owner.
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../client';
import { calendars } from '../schema';

export type CalendarRow = typeof calendars.$inferSelect;
export type CalendarValues = { name: string; color?: string; hidden?: boolean };
/** A calendar that belongs to a connection. */
export type ConnectedCalendarValues = CalendarValues & { connectionId: string; readOnly: boolean; remoteId?: string };
/** Where an ICS feed was at its last fetch. */
export type FeedState = { remoteEtag: string | null; remoteLastModified: string | null; contentHash: string | null };

export const listCalendars = (db: Executor, ownerUserId: string): Promise<CalendarRow[]> =>
  db.select().from(calendars).where(eq(calendars.ownerUserId, ownerUserId)).orderBy(asc(calendars.createdAt));

export async function insertCalendar(
  db: Executor,
  ownerUserId: string,
  values: CalendarValues | ConnectedCalendarValues,
): Promise<CalendarRow> {
  const [row] = await db
    .insert(calendars)
    .values({ ownerUserId, ...values })
    .returning();
  if (!row) throw new Error('insert into calendars returned no row');
  return row;
}

/** Returns the updated row, or undefined if the calendar isn't the owner's. */
export async function updateCalendar(
  db: Executor,
  ownerUserId: string,
  id: string,
  values: Partial<CalendarValues>,
): Promise<CalendarRow | undefined> {
  const [row] = await db
    .update(calendars)
    .set(values)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, ownerUserId)))
    .returning();
  return row;
}

/** Deletes the calendar (its events cascade). Returns false if it isn't the owner's. */
export async function deleteCalendar(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, ownerUserId)))
    .returning({ id: calendars.id });
  return rows.length > 0;
}

export async function calendarIsOwned(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, ownerUserId)));
  return Boolean(row);
}

export async function findOwnedCalendar(
  db: Executor,
  ownerUserId: string,
  id: string,
): Promise<CalendarRow | undefined> {
  const [row] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, ownerUserId)));
  return row;
}

/** The calendars of these connections (any owner: callers have already checked the connections). */
export const listConnectionCalendars = (db: Executor, connectionIds: readonly string[]): Promise<CalendarRow[]> =>
  connectionIds.length
    ? db
        .select()
        .from(calendars)
        .where(inArray(calendars.connectionId, [...connectionIds]))
        .orderBy(asc(calendars.createdAt))
    : Promise.resolve([]);

export async function updateFeedState(db: Executor, id: string, state: FeedState): Promise<void> {
  await db.update(calendars).set(state).where(eq(calendars.id, id));
}

export async function updateSyncToken(db: Executor, id: string, syncToken: string | null): Promise<void> {
  await db.update(calendars).set({ syncToken }).where(eq(calendars.id, id));
}

export async function setRemoteMissing(db: Executor, id: string, remoteMissing: boolean): Promise<void> {
  await db.update(calendars).set({ remoteMissing }).where(eq(calendars.id, id));
}
