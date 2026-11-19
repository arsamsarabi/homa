// Events (single ones and recurring series), always filtered by owner where a user asks.
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
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
