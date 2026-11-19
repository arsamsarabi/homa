// Overrides: changed occurrences of recurring events.
import { and, eq, gte, inArray, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { eventOverrides } from '../schema';

export type OverrideRow = typeof eventOverrides.$inferSelect;
export type OverrideColumns = {
  summary: string | null;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
};

export const listOverrides = (db: Executor, eventIds: readonly string[]): Promise<OverrideRow[]> =>
  eventIds.length
    ? db
        .select()
        .from(eventOverrides)
        .where(inArray(eventOverrides.eventId, [...eventIds]))
    : Promise.resolve([]);

export async function findOverride(
  db: Executor,
  eventId: string,
  recurrenceId: Date,
): Promise<OverrideRow | undefined> {
  const [row] = await db
    .select()
    .from(eventOverrides)
    .where(and(eq(eventOverrides.eventId, eventId), eq(eventOverrides.recurrenceId, recurrenceId)));
  return row;
}

export async function upsertOverride(
  db: Executor,
  eventId: string,
  recurrenceId: Date,
  columns: OverrideColumns,
): Promise<void> {
  await db
    .insert(eventOverrides)
    .values({ eventId, recurrenceId, ...columns })
    .onConflictDoUpdate({ target: [eventOverrides.eventId, eventOverrides.recurrenceId], set: columns });
}

/** Deletes the event's override at `recurrenceId`, or (with `onward`) every one from it on. */
export async function deleteOverrides(
  db: Executor,
  eventId: string,
  recurrenceId: Date,
  onward = false,
): Promise<void> {
  await db
    .delete(eventOverrides)
    .where(
      and(
        eq(eventOverrides.eventId, eventId),
        onward ? gte(eventOverrides.recurrenceId, recurrenceId) : eq(eventOverrides.recurrenceId, recurrenceId),
      ),
    );
}

/**
 * Moves an event's overrides with its series by `shiftMs`. Overrides that only changed the title
 * or details (start still at their recurrence id) also take the series' new length `durationMs`.
 * With `from`, only overrides from that recurrence id on move, and `toEventId` re-parents them
 * (a "this and following" split).
 */
export async function shiftOverrides(
  db: Executor,
  eventId: string,
  shiftMs: number,
  durationMs: number,
  split?: { from: Date; toEventId: string },
): Promise<void> {
  const delta = sql`make_interval(secs => ${shiftMs / 1000})`;
  const unmoved = sql`${eventOverrides.startAt} = ${eventOverrides.recurrenceId}`;
  const set: Record<string, SQL | string> = {
    recurrenceId: sql`${eventOverrides.recurrenceId} + ${delta}`,
    startAt: sql`case when ${unmoved} then ${eventOverrides.recurrenceId} + ${delta} else ${eventOverrides.startAt} end`,
    endAt: sql`case when ${unmoved} then ${eventOverrides.recurrenceId} + ${delta} + make_interval(secs => ${durationMs / 1000}) else ${eventOverrides.endAt} end`,
  };
  if (split) set.eventId = split.toEventId;
  await db
    .update(eventOverrides)
    .set(set)
    .where(and(eq(eventOverrides.eventId, eventId), split ? gte(eventOverrides.recurrenceId, split.from) : undefined));
}
