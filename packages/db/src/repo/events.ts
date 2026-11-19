// Events (single ones and recurring series), always filtered by owner where a user asks.
import { and, asc, eq, inArray, isNotNull, lt, notInArray } from 'drizzle-orm';
import type { Executor } from '../client';
import { events } from '../schema';

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
/** Columns a change may set. */
export type EventColumns = Partial<Omit<NewEventRow, 'id' | 'ownerUserId' | 'uid' | 'createdAt' | 'updatedAt'>>;

export async function findOwnedEvent(db: Executor, ownerUserId: string, id: string): Promise<EventRow | undefined> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.ownerUserId, ownerUserId)));
  return row;
}

/** Any owner's event: for the instance cache, which is rebuilt by event id only. */
export async function findEvent(db: Executor, id: string): Promise<EventRow | undefined> {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row;
}

export async function insertEvent(db: Executor, values: NewEventRow): Promise<EventRow> {
  const [row] = await db.insert(events).values(values).returning();
  if (!row) throw new Error('insert into events returned no row');
  return row;
}

export async function updateEventColumns(db: Executor, id: string, columns: EventColumns): Promise<void> {
  await db.update(events).set(columns).where(eq(events.id, id));
}

export async function deleteEvent(db: Executor, id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
}

export const listEventsByIds = (db: Executor, ids: readonly string[]): Promise<EventRow[]> =>
  ids.length
    ? db
        .select()
        .from(events)
        .where(inArray(events.id, [...ids]))
    : Promise.resolve([]);

/** Recurring events whose cached window ends before `before`. */
export const listEventsToExtend = (db: Executor, before: Date): Promise<{ id: string }[]> =>
  db
    .select({ id: events.id })
    .from(events)
    .where(and(isNotNull(events.rrule), lt(events.expandedUntil, before)));

/** The owner's recurring events that start before `to` but whose cache stops before it. */
export const listEventsPastCache = (
  db: Executor,
  ownerUserId: string,
  to: Date,
  calendarIds?: readonly string[],
): Promise<EventRow[]> =>
  db
    .select()
    .from(events)
    .where(
      and(
        eq(events.ownerUserId, ownerUserId),
        isNotNull(events.rrule),
        lt(events.expandedUntil, to),
        lt(events.startAt, to),
        calendarIds?.length ? inArray(events.calendarId, [...calendarIds]) : undefined,
      ),
    );

/** Ids of the calendar's events with these iCalendar UIDs, by UID: what an import updates. */
export async function findEventIdsByUid(
  db: Executor,
  calendarId: string,
  uids: readonly string[],
): Promise<Map<string, string>> {
  if (!uids.length) return new Map();
  const rows = await db
    .select({ id: events.id, uid: events.uid })
    .from(events)
    .where(and(eq(events.calendarId, calendarId), inArray(events.uid, [...uids])));
  return new Map(rows.map((r) => [r.uid, r.id]));
}

/** Every event the user owns, oldest first: for the data export. */
export const listOwnerEvents = (db: Executor, ownerUserId: string): Promise<EventRow[]> =>
  db.select().from(events).where(eq(events.ownerUserId, ownerUserId)).orderBy(asc(events.createdAt), asc(events.id));

/** Deletes the calendar's events whose UID isn't in `keep` (a feed dropped them). Returns how many. */
export async function deleteEventsNotInUids(
  db: Executor,
  calendarId: string,
  keep: readonly string[],
): Promise<number> {
  const rows = await db
    .delete(events)
    .where(and(eq(events.calendarId, calendarId), keep.length ? notInArray(events.uid, [...keep]) : undefined))
    .returning({ id: events.id });
  return rows.length;
}

/** href → ETag of the calendar's events that came from (or went to) the remote calendar. */
export async function listRemoteState(db: Executor, calendarId: string): Promise<Map<string, string | null>> {
  const rows = await db
    .select({ href: events.remoteHref, etag: events.remoteEtag })
    .from(events)
    .where(and(eq(events.calendarId, calendarId), isNotNull(events.remoteHref)));
  return new Map(rows.map((r) => [r.href as string, r.etag]));
}

/** Deletes the calendar's events stored at these remote hrefs. Returns their UIDs. */
export async function deleteEventsByHref(
  db: Executor,
  calendarId: string,
  hrefs: readonly string[],
): Promise<string[]> {
  if (!hrefs.length) return [];
  const rows = await db
    .delete(events)
    .where(and(eq(events.calendarId, calendarId), inArray(events.remoteHref, [...hrefs])))
    .returning({ uid: events.uid });
  return rows.map((r) => r.uid);
}
