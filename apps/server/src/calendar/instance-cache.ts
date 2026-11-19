// Keeps event_instances (the expansion cache) in step with events. Every write to an event or its
// overrides re-expands it in the same transaction; a nightly job moves the horizon forward.
import { extendBefore, horizonFrom, occurrencesWithOverrides } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';

/** Rebuilds an event's cached occurrences, up to the horizon for recurring events. */
export async function reexpand(tx: Executor, eventId: string, now = new Date()): Promise<void> {
  const e = await repo.findEvent(tx, eventId);
  if (!e) {
    await repo.deleteInstances(tx, eventId);
    return;
  }
  const until = e.rrule ? horizonFrom(now) : null;
  const overrides = await repo.listOverrides(tx, [eventId]);
  await repo.replaceInstances(tx, e, occurrencesWithOverrides(e, overrides, new Date(0), until ?? new Date(8.64e15)));
  await repo.updateEventColumns(tx, eventId, { expandedUntil: until });
}

/** Re-expands recurring events whose cached window ends within a month. Returns how many. */
export async function extendHorizon(db: Db, now = new Date()): Promise<number> {
  const due = await repo.listEventsToExtend(db, extendBefore(now));
  for (const { id } of due) await db.transaction((tx) => reexpand(tx, id, now));
  return due.length;
}
