// Writes what a pull (or a refetch after a conflict) found into a local calendar, in the caller's
// transaction. Events are matched by UID, as in an import, and keep their remote href and ETag.
import { type Executor, repo } from '@homa/db';
import type { PullResult, RemoteResource } from '@homa/sync';
import { writeIcsEvents } from '@/calendar';

/**
 * Writes remote resources into the calendar: each one's events upserted by UID with its href and
 * ETag, `deleted` hrefs removed. A pending local change to an event the server also changed or
 * deleted is dropped (the remote wins); returns those events' titles for a notice.
 */
export async function applyResources(
  tx: Executor,
  calendar: repo.CalendarRow,
  changed: readonly RemoteResource[],
  deleted: readonly string[],
): Promise<string[]> {
  const pending = await repo.pendingOutboxUids(tx, calendar.id);
  // A resource without events (a to-do, or nothing Homa can read) no longer holds an event.
  const gone = [...deleted, ...changed.filter((r) => !r.events.length).map((r) => r.href)];
  const deletedUids = await repo.deleteEventsByHref(tx, calendar.id, gone);
  const events = changed.flatMap((r) => r.events);
  await writeIcsEvents(tx, calendar.ownerUserId, calendar.id, events);
  const ids = await repo.findEventIdsByUid(
    tx,
    calendar.id,
    events.map((e) => e.uid),
  );
  for (const r of changed)
    for (const e of r.events) {
      const id = ids.get(e.uid);
      if (id) await repo.updateEventColumns(tx, id, { remoteHref: r.href, remoteEtag: r.etag });
    }
  const conflicted = [...deletedUids, ...events.map((e) => e.uid)].filter((uid) => pending.has(uid));
  await repo.dropOutbox(tx, calendar.id, conflicted);
  const titles = new Map(events.map((e) => [e.uid, e.summary]));
  return conflicted.map((uid) => titles.get(uid) ?? '');
}

/** Writes a pull's result into the calendar. Call inside a transaction. Returns conflicted titles. */
export async function applyPull(tx: Executor, calendar: repo.CalendarRow, result: PullResult): Promise<string[]> {
  const { remoteEtag, remoteLastModified, contentHash, syncToken } = result.cursor;
  await repo.updateFeedState(tx, calendar.id, { remoteEtag, remoteLastModified, contentHash });
  await repo.updateSyncToken(tx, calendar.id, syncToken);
  if (result.kind === 'unchanged') return [];
  if (result.kind === 'delta') return applyResources(tx, calendar, result.changed, result.deleted);
  await writeIcsEvents(tx, calendar.ownerUserId, calendar.id, result.events);
  await repo.deleteEventsNotInUids(
    tx,
    calendar.id,
    result.events.map((e) => e.uid),
  );
  return [];
}

/** The notice for changes the server's copy won over. */
export function conflictNotice(titles: readonly string[]): string | null {
  if (!titles.length) return null;
  if (titles.length === 1 && titles[0])
    return `Your change to "${titles[0]}" conflicted with a change on the server, so the server's version was kept.`;
  return `${titles.length} of your changes conflicted with changes on the server, so the server's versions were kept.`;
}
