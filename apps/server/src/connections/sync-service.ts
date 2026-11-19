// Syncs connected calendars. A sync claims its connection (so two never run at once), pulls with the
// provider's adapter outside any transaction, then applies the result in one transaction: each
// event is upserted by UID and re-expanded, and events the feed no longer has are deleted. A failure
// is stored on the connection as a message safe to show (never the URL) and never stops the run.
import { UnavailableError, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import {
  decryptCredentials,
  type IcsCredentials,
  icsAdapter,
  type PullResult,
  type SyncAdapter,
  type SyncCursor,
  SyncError,
} from '@homa/sync';
import { writeIcsEvents } from '@/calendar';
import { errorFields, log } from '@/log';
import type { SyncSettings } from './sync-settings';

/** A claim older than this belongs to a sync that died (a restarted worker); it can be taken over. */
const STALE_CLAIM_MS = 10 * 60_000;
/** Most connections one scheduled run syncs; the rest wait for the next run. */
const BATCH = 50;

export const KEY_MISSING =
  'Connected calendars need HOMA_ENCRYPTION_KEY to be set on the server. Ask your admin to add it.';

export function requireKey(settings: SyncSettings): NonNullable<SyncSettings['key']> {
  if (!settings.key) throw new UnavailableError(KEY_MISSING);
  return settings.key;
}

const expected = (err: unknown): err is Error =>
  err instanceof SyncError || err instanceof ValidationError || err instanceof UnavailableError;

/** The user-facing reason a sync failed. Unexpected errors are logged and not shown. */
export const failureMessage = (err: unknown): string =>
  expected(err) ? err.message : 'Something went wrong while syncing';

export function adapterFor(
  connection: repo.ConnectionRow,
  credentials: unknown,
  settings: SyncSettings,
  floatingTz: string,
): SyncAdapter {
  if (connection.provider !== 'ics') throw new SyncError(`${connection.provider} connections aren't supported yet`);
  const url = (credentials as Partial<IcsCredentials> | null)?.url;
  if (typeof url !== 'string') throw new Error('ICS credentials without a URL');
  return icsAdapter({ url }, { floatingTz, policy: settings.policy });
}

const cursorOf = (c: repo.CalendarRow): SyncCursor => ({
  remoteEtag: c.remoteEtag,
  remoteLastModified: c.remoteLastModified,
  contentHash: c.contentHash,
  syncToken: c.syncToken,
});

/** Writes a pull's result into the calendar. Call inside a transaction. */
export async function applyPull(tx: Executor, calendar: repo.CalendarRow, result: PullResult): Promise<void> {
  const { remoteEtag, remoteLastModified, contentHash } = result.cursor;
  await repo.updateFeedState(tx, calendar.id, { remoteEtag, remoteLastModified, contentHash });
  if (result.kind === 'unchanged') return;
  await writeIcsEvents(tx, calendar.ownerUserId, calendar.id, result.events);
  await repo.deleteEventsNotInUids(
    tx,
    calendar.id,
    result.events.map((e) => e.uid),
  );
}

export type SyncOutcome = 'changed' | 'unchanged' | 'failed' | 'busy';

/** Syncs one connection by id (any owner: callers check ownership). Never throws for a bad feed. */
export async function syncConnection(
  db: Db,
  settings: SyncSettings,
  id: string,
  now = new Date(),
): Promise<SyncOutcome> {
  const connection = await repo.claimConnection(db, id, new Date(now.getTime() - STALE_CLAIM_MS));
  if (!connection) return 'busy';
  try {
    const key = requireKey(settings);
    const credentials = (() => {
      try {
        return decryptCredentials(key, connection.id, connection.credentials);
      } catch {
        throw new SyncError("Can't read this connection's saved details: the server's encryption key has changed");
      }
    })();
    const [calendar] = await repo.listConnectionCalendars(db, [connection.id]);
    if (!calendar) throw new SyncError('The calendar for this connection is missing');
    const floatingTz = (await repo.findSettings(db, connection.ownerUserId))?.homeTz ?? 'UTC';
    const result = await adapterFor(connection, credentials, settings, floatingTz).pullChanges(
      { remoteId: calendar.remoteId, name: calendar.name, readOnly: calendar.readOnly },
      cursorOf(calendar),
    );
    await db.transaction((tx) => applyPull(tx, calendar, result));
    await repo.finishSync(db, connection.id, { status: 'ok', lastError: null, lastSyncedAt: new Date() });
    return result.kind === 'unchanged' ? 'unchanged' : 'changed';
  } catch (err) {
    const message = failureMessage(err);
    if (expected(err)) log.warn('sync failed', { connectionId: id, reason: message });
    else log.error('sync failed', { connectionId: id, ...errorFields(err) });
    await repo.finishSync(db, connection.id, { status: 'error', lastError: message, lastSyncedAt: new Date() });
    return 'failed';
  }
}

/**
 * Syncs every connection last tried more than the interval ago (up to a batch), one at a time.
 * Returns counts for the job log.
 */
export async function syncDueConnections(
  db: Db,
  settings: SyncSettings,
  now = new Date(),
): Promise<Record<SyncOutcome, number>> {
  const counts: Record<SyncOutcome, number> = { changed: 0, unchanged: 0, failed: 0, busy: 0 };
  if (!settings.key) return counts;
  const due = await repo.listDueConnections(db, new Date(now.getTime() - settings.intervalMinutes * 60_000), BATCH);
  for (const { id } of due) {
    try {
      counts[await syncConnection(db, settings, id, now)]++;
    } catch (err) {
      // A database error on one connection: log it and go on with the rest.
      log.error('sync failed', { connectionId: id, ...errorFields(err) });
      counts.failed++;
    }
  }
  return counts;
}
