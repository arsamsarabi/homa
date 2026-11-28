// Pushes a connection's outbox: each due op uploads an event's current state (CalDAV: PUT with
// If-Match, or If-None-Match: * when it's new; Google: patch with If-Match, or insert; Microsoft: patch after checking the changeKey, or create) or deletes a resource at the ETag it had. Ops are independent:
// one failing waits with backoff and the rest go on. On a conflict the server's copy wins: it is
// fetched again and written over the local event (or the local event goes, if the server deleted
// it). A change the server refuses outright is dropped with a notice on the connection.
import { serializeEvent, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { PushConflict, PushError, type SyncAdapter } from '@homa/sync';
import { errorFields, log } from '@/log';
import { applyResources } from './apply-pull';

/** Most ops one push sends; the rest wait for the next run. */
const BATCH = 100;
/** After this many failed tries an op is dropped with a notice. */
const MAX_ATTEMPTS = 12;
const MINUTE = 60_000;

/** Wait before try `attempts + 1`: 1, 2, 4 … minutes, at most 6 hours. */
export const backoffMs = (attempts: number): number => Math.min(2 ** attempts * MINUTE, 360 * MINUTE);

type Pushed = { href: string; title: string };

async function pushOne(
  db: Db,
  adapter: SyncAdapter,
  calendar: repo.CalendarRow & { remoteId: string },
  op: repo.OutboxRow,
): Promise<Pushed | null> {
  if (op.kind === 'delete') {
    // Without an ETag there's no remote state to match, so nothing is deleted.
    if (op.href && op.etag) await adapter.pushChange({ kind: 'delete', href: op.href, etag: op.etag });
    return null;
  }
  const e = op.eventId ? await repo.findEvent(db, op.eventId) : undefined;
  if (!e || e.calendarId !== op.calendarId) return null; // deleted or moved since: a later op covers it
  const planned = e.remoteHref ?? adapter.newHref(calendar.remoteId, e.uid);
  const reminders = (await repo.listEventReminders(db, [e.id])).get(e.id) ?? [];
  const ics = serializeEvent(e, await repo.listOverrides(db, [e.id]), new Date(), reminders, adapter.extension);
  const result = await adapter.pushChange({
    kind: 'put',
    href: planned,
    ics,
    etag: e.remoteHref ? e.remoteEtag : null,
  });
  // Microsoft picks a new event's id, so its href is known only now.
  const href = result.href ?? planned;
  const { etag } = result;
  const pushed = { href, title: e.summary };
  // Some servers change what they store and send no ETag; read it back so the next edit can match.
  const remoteEtag = etag ?? (await adapter.fetchResource(href))?.etag ?? null;
  await repo.updateEventColumns(db, e.id, { remoteHref: href, remoteEtag });
  return pushed;
}

/** Remote wins: writes the server's copy of `href` over the local event, or deletes it if gone. */
async function takeRemote(db: Db, adapter: SyncAdapter, calendar: repo.CalendarRow, href: string): Promise<void> {
  const remote = await adapter.fetchResource(href);
  await db.transaction(async (tx) => {
    await applyResources(tx, calendar, remote ? [remote] : [], remote ? [] : [href]);
  });
}

/**
 * Pushes the connection's due ops. Returns the titles of events whose change lost to the server's
 * copy (for the conflict notice); refused changes set their own notice.
 */
export async function pushOutbox(
  db: Db,
  adapter: SyncAdapter,
  connection: repo.ConnectionRow,
  calendars: readonly repo.CalendarRow[],
  now = new Date(),
): Promise<string[]> {
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const conflicts: string[] = [];
  for (const op of await repo.listDueOutbox(db, connection.id, now, BATCH)) {
    const calendar = byId.get(op.calendarId);
    if (!calendar?.remoteId || calendar.readOnly) {
      await repo.completeOutbox(db, op.id, op.version);
      continue;
    }
    const target = { ...calendar, remoteId: calendar.remoteId };
    try {
      await pushOne(db, adapter, target, op);
      await repo.completeOutbox(db, op.id, op.version);
    } catch (err) {
      const e = op.eventId ? await repo.findEvent(db, op.eventId) : undefined;
      const title = e?.summary ?? '';
      if (err instanceof PushConflict) {
        const href = op.kind === 'delete' ? op.href : (e?.remoteHref ?? adapter.newHref(target.remoteId, op.uid));
        if (href) await takeRemote(db, adapter, calendar, href);
        await repo.completeOutbox(db, op.id, op.version);
        conflicts.push(title);
        continue;
      }
      const refused = (err instanceof PushError && !err.retriable) || err instanceof ValidationError;
      const attempts = op.attempts + 1;
      if (refused || attempts >= MAX_ATTEMPTS) {
        const reason = err instanceof Error && (refused || err instanceof PushError) ? err.message : 'it kept failing';
        log.warn('outbox op dropped', { connectionId: connection.id, opId: op.id, reason });
        await repo.completeOutbox(db, op.id, op.version);
        await repo.setConnectionNotice(
          db,
          connection.id,
          `Couldn't save ${title ? `"${title}"` : 'a change'} to ${calendar.name} on the server: ${reason}.`,
        );
        continue;
      }
      if (!(err instanceof PushError))
        log.warn('outbox op failed', { connectionId: connection.id, ...errorFields(err) });
      const lastError = err instanceof Error ? err.message.slice(0, 500) : 'unknown error';
      await repo.deferOutbox(db, op.id, op.version, {
        attempts,
        nextAttemptAt: new Date(
          now.getTime() + Math.max(backoffMs(attempts), err instanceof PushError ? (err.retryAfterMs ?? 0) : 0),
        ),
        lastError,
      });
    }
  }
  return conflicts;
}
