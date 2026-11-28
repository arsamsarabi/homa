// Keeps event_instances (the expansion cache) in step with events. Every write to an event or its
// overrides re-expands it in the same transaction; a nightly job moves the horizon forward.
import { cacheWindow, extendBefore, occurrencesWithOverrides } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';

/** Rebuilds an event's cached occurrences, up to the horizon (or a window, for dense rules) for recurring events. Returns how many. */
export async function reexpand(tx: Executor, eventId: string, now = new Date()): Promise<number> {
  const e = await repo.findEvent(tx, eventId);
  if (!e) {
    await repo.deleteInstances(tx, eventId);
    return 0;
  }
  const window = e.rrule ? cacheWindow(e, now) : null;
  const overrides = await repo.listOverrides(tx, [eventId]);
  const occurrences = occurrencesWithOverrides(
    e,
    overrides,
    window?.from ?? new Date(0),
    window?.until ?? new Date(8.64e15),
  );
  await repo.replaceInstances(tx, e, occurrences);
  await repo.updateEventColumns(tx, eventId, {
    expandedUntil: window?.until ?? null,
    expandedFrom: window?.from ?? null,
  });
  return occurrences.length;
}

/** Re-expands recurring events whose cached window ends within a month. Returns how many. */
export async function extendHorizon(db: Db, now = new Date()): Promise<number> {
  const due = await repo.listEventsToExtend(db, extendBefore(now));
  for (const { id } of due)
    await db.transaction(async (tx) => {
      await reexpand(tx, id, now);
    });
  return due.length;
}
