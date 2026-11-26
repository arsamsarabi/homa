// The expansion cache: one row per occurrence, queried by time range with a GiST index.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { eventInstances } from '../schema';

export type CachedOccurrence = { eventId: string; recurrenceId: Date; start: Date; end: Date };

const range = (from: Date, to: Date): string => `[${from.toISOString()},${to.toISOString()})`;
const BATCH = 1000;

/** Replaces an event's cached occurrences. */
export async function replaceInstances(
  db: Executor,
  event: { id: string; ownerUserId: string; calendarId: string },
  occurrences: readonly { recurrenceId: Date; start: Date; end: Date }[],
): Promise<void> {
  await db.delete(eventInstances).where(eq(eventInstances.eventId, event.id));
  for (let i = 0; i < occurrences.length; i += BATCH) {
    await db.insert(eventInstances).values(
      occurrences.slice(i, i + BATCH).map((o) => ({
        eventId: event.id,
        ownerUserId: event.ownerUserId,
        calendarId: event.calendarId,
        recurrenceId: o.recurrenceId,
        during: range(o.start, o.end),
      })),
    );
  }
}

export async function deleteInstances(db: Executor, eventId: string): Promise<void> {
  await db.delete(eventInstances).where(eq(eventInstances.eventId, eventId));
}

/** The owner's cached occurrences overlapping [from, to). */
export const listCachedOccurrences = (
  db: Executor,
  ownerUserId: string,
  from: Date,
  to: Date,
  calendarIds?: readonly string[],
): Promise<CachedOccurrence[]> =>
  db
    .select({
      eventId: eventInstances.eventId,
      recurrenceId: eventInstances.recurrenceId,
      start: sql<Date>`lower(${eventInstances.during})`.mapWith((v: string) => new Date(v)),
      end: sql<Date>`upper(${eventInstances.during})`.mapWith((v: string) => new Date(v)),
    })
    .from(eventInstances)
    .where(
      and(
        eq(eventInstances.ownerUserId, ownerUserId),
        sql`${eventInstances.during} && ${range(from, to)}::tstzrange`,
        calendarIds?.length ? inArray(eventInstances.calendarId, [...calendarIds]) : undefined,
      ),
    );

/** Cached occurrences for these calendars (any owner; callers have checked access) overlapping [from, to). */
export const listCachedOccurrencesForCalendars = (
  db: Executor,
  calendarIds: readonly string[],
  from: Date,
  to: Date,
): Promise<CachedOccurrence[]> =>
  calendarIds.length
    ? db
        .select({
          eventId: eventInstances.eventId,
          recurrenceId: eventInstances.recurrenceId,
          start: sql<Date>`lower(${eventInstances.during})`.mapWith((v: string) => new Date(v)),
          end: sql<Date>`upper(${eventInstances.during})`.mapWith((v: string) => new Date(v)),
        })
        .from(eventInstances)
        .where(
          and(
            inArray(eventInstances.calendarId, [...calendarIds]),
            sql`${eventInstances.during} && ${range(from, to)}::tstzrange`,
          ),
        )
    : Promise.resolve([]);
