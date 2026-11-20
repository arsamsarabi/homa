// Reminders: an event's alarms (replaced whole) and a user's standalone reminders, always filtered
// by owner where a user asks. The delivery job reads due ones across every owner.
import { and, asc, count, eq, inArray, isNotNull, isNull, lte, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { eventInstances, eventOverrides, events, type ReminderAction, reminders, users } from '../schema';

export type ReminderRow = typeof reminders.$inferSelect;
export type EventReminder = { minutes: number; action: ReminderAction };

/** Each event's reminders, sorted by minutes. Events without any are missing from the map. */
export async function listEventReminders(
  db: Executor,
  eventIds: readonly string[],
): Promise<Map<string, EventReminder[]>> {
  const out = new Map<string, EventReminder[]>();
  if (!eventIds.length) return out;
  const rows = await db
    .select({ eventId: reminders.eventId, minutes: reminders.minutesBefore, action: reminders.action })
    .from(reminders)
    .where(inArray(reminders.eventId, [...eventIds]))
    .orderBy(asc(reminders.minutesBefore));
  for (const r of rows) {
    if (!r.eventId || r.minutes === null) continue;
    out.set(r.eventId, [...(out.get(r.eventId) ?? []), { minutes: r.minutes, action: r.action }]);
  }
  return out;
}

/** Replaces the event's reminders. */
export async function replaceEventReminders(
  db: Executor,
  ownerUserId: string,
  eventId: string,
  list: readonly EventReminder[],
): Promise<void> {
  await db.delete(reminders).where(eq(reminders.eventId, eventId));
  if (list.length)
    await db
      .insert(reminders)
      .values(list.map((r) => ({ ownerUserId, eventId, minutesBefore: r.minutes, action: r.action })));
}

/** An occurrence with one of its event's reminders, as the delivery job reads them. */
export type DueEventReminder = {
  ownerUserId: string;
  eventId: string;
  reminderId: string;
  recurrenceId: Date;
  start: Date;
  minutes: number;
  allDay: boolean;
  tz: string;
  homeTz: string | null;
  title: string;
};

const asDate = (v: string | Date): Date => new Date(v);

/**
 * Cached occurrences whose `start - minutes` falls in [from, to), with the reminder. Whole-day
 * offsets and all-day events can move the exact time by a day; callers widen the range and filter.
 */
export const listEventRemindersBetween = (
  db: Executor,
  from: Date,
  to: Date,
  maxMinutes: number,
): Promise<DueEventReminder[]> =>
  db
    .select({
      ownerUserId: events.ownerUserId,
      eventId: events.id,
      reminderId: reminders.id,
      recurrenceId: eventInstances.recurrenceId,
      start: sql<Date>`lower(${eventInstances.during})`.mapWith(asDate),
      minutes: sql<number>`${reminders.minutesBefore}`.mapWith(Number),
      allDay: events.allDay,
      tz: events.tz,
      homeTz: users.homeTz,
      title: sql<string>`coalesce(${eventOverrides.summary}, ${events.summary})`,
    })
    .from(reminders)
    .innerJoin(eventInstances, eq(eventInstances.eventId, reminders.eventId))
    .innerJoin(events, eq(events.id, reminders.eventId))
    .innerJoin(users, eq(users.id, events.ownerUserId))
    .leftJoin(
      eventOverrides,
      and(eq(eventOverrides.eventId, events.id), eq(eventOverrides.recurrenceId, eventInstances.recurrenceId)),
    )
    .where(
      and(
        // The GiST index narrows to occurrences starting within the longest offset of the range.
        sql`${eventInstances.during} && tstzrange(${from.toISOString()}::timestamptz, ${new Date(to.getTime() + maxMinutes * 60_000).toISOString()}::timestamptz)`,
        sql`lower(${eventInstances.during}) - make_interval(mins => ${reminders.minutesBefore}) >= ${from.toISOString()}::timestamptz`,
        sql`lower(${eventInstances.during}) - make_interval(mins => ${reminders.minutesBefore}) < ${to.toISOString()}::timestamptz`,
      ),
    );

// --- Standalone reminders ---

export type StandaloneValues = {
  title: string;
  startsAt: Date;
  tz: string;
  rrule: string | null;
  nextFireAt: Date | null;
};

const standalone = (ownerUserId: string, id: string): SQL | undefined =>
  and(eq(reminders.id, id), eq(reminders.ownerUserId, ownerUserId), isNull(reminders.eventId));

export async function insertStandalone(db: Executor, ownerUserId: string, v: StandaloneValues): Promise<ReminderRow> {
  const [row] = await db
    .insert(reminders)
    .values({ ownerUserId, ...v })
    .returning();
  if (!row) throw new Error('insert into reminders returned no row');
  return row;
}

export async function findOwnedStandalone(
  db: Executor,
  ownerUserId: string,
  id: string,
): Promise<ReminderRow | undefined> {
  const [row] = await db.select().from(reminders).where(standalone(ownerUserId, id));
  return row;
}

/** Returns the updated row, or undefined if it isn't the owner's standalone reminder. */
export async function updateStandalone(
  db: Executor,
  ownerUserId: string,
  id: string,
  v: Partial<StandaloneValues> & { doneAt?: Date | null },
): Promise<ReminderRow | undefined> {
  const [row] = await db.update(reminders).set(v).where(standalone(ownerUserId, id)).returning();
  return row;
}

/** True if a row was deleted. */
export async function deleteStandalone(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db.delete(reminders).where(standalone(ownerUserId, id)).returning({ id: reminders.id });
  return rows.length > 0;
}

/** The owner's standalone reminders not marked done, soonest first. */
export const listStandalone = (db: Executor, ownerUserId: string): Promise<ReminderRow[]> =>
  db
    .select()
    .from(reminders)
    .where(and(eq(reminders.ownerUserId, ownerUserId), isNull(reminders.eventId), isNull(reminders.doneAt)))
    .orderBy(sql`${reminders.nextFireAt} asc nulls last`, asc(reminders.startsAt));

export async function countOpenStandalone(db: Executor, ownerUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(reminders)
    .where(and(eq(reminders.ownerUserId, ownerUserId), isNull(reminders.eventId), isNull(reminders.doneAt)));
  return row?.n ?? 0;
}

/** Standalone reminders due by `now`, locked for this transaction (others skip them). */
export const claimDueStandalone = (db: Executor, now: Date, limit: number): Promise<ReminderRow[]> =>
  db
    .select()
    .from(reminders)
    .where(and(isNotNull(reminders.nextFireAt), lte(reminders.nextFireAt, now), isNull(reminders.doneAt)))
    .orderBy(asc(reminders.nextFireAt))
    .limit(limit)
    .for('update', { skipLocked: true });

export async function setNextFire(db: Executor, id: string, nextFireAt: Date | null): Promise<void> {
  await db.update(reminders).set({ nextFireAt }).where(eq(reminders.id, id));
}
