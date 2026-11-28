// Syncs connected calendars. A sync claims its connection (so two never run at once), pushes the
// outbox (CalDAV, Google and Microsoft), then pulls each calendar with the provider's adapter outside any transaction and
// applies the result in one transaction per calendar. A failure is stored on the connection as a
// message safe to show (never the URL or a password) and never stops the run.
import { UnavailableError, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import {
  type CaldavCredentials,
  CalendarGoneError,
  caldavAdapter,
  caldavProvider,
  decryptCredentials,
  encryptCredentials,
  type GoogleCredentials,
  googleAdapter,
  type IcsCredentials,
  icsAdapter,
  type MicrosoftCredentials,
  microsoftAdapter,
  type SyncAdapter,
  type SyncCursor,
  SyncError,
} from '@homa/sync';
import { errorFields, log } from '@/log';
import { applyPull, conflictNotice } from './apply-pull';
import { pushOutbox } from './outbox-push';
import type { SyncSettings } from './sync-settings';

/** A claim older than this belongs to a sync that died (a restarted worker); it can be taken over. */
export const STALE_CLAIM_MS = 10 * 60_000;
/** Most connections one scheduled run syncs; the rest wait for the next run. */
const BATCH = 50;

export const KEY_MISSING =
  'Connected calendars need HOMA_ENCRYPTION_KEY to be set on the server. Ask your admin to add it.';

export function requireKey(settings: SyncSettings): NonNullable<SyncSettings['key']> {
  if (!settings.key) throw new UnavailableError(KEY_MISSING);
  return settings.key;
}

export const expected = (err: unknown): err is Error =>
  err instanceof SyncError || err instanceof ValidationError || err instanceof UnavailableError;

/** The user-facing reason a sync failed. Unexpected errors are logged and not shown. */
export const failureMessage = (err: unknown): string =>
  expected(err) ? err.message : 'Something went wrong while syncing';

/** The connection's decrypted credentials. SyncError if the key changed since they were saved. */
export function credentialsOf(settings: SyncSettings, connection: repo.ConnectionRow): unknown {
  const key = requireKey(settings);
  try {
    return decryptCredentials(key, connection.id, connection.credentials);
  } catch {
    throw new SyncError("Can't read this connection's saved details: the server's encryption key has changed");
  }
}

export function caldavCredentials(value: unknown): CaldavCredentials {
  const c = value as Partial<CaldavCredentials> | null;
  if (typeof c?.serverUrl !== 'string' || typeof c.username !== 'string' || typeof c.password !== 'string')
    throw new Error('CalDAV credentials without a server, user name or password');
  return { serverUrl: c.serverUrl, username: c.username, password: c.password, homeUrl: c.homeUrl };
}

/** Google's and Microsoft's stored tokens have the same shape. */
export function oauthCredentials(value: unknown): GoogleCredentials & MicrosoftCredentials {
  const c = value as Partial<GoogleCredentials> | null;
  if (typeof c?.accessToken !== 'string' || typeof c.refreshToken !== 'string' || typeof c.expiresAt !== 'number')
    throw new Error('OAuth credentials without tokens');
  return { accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt };
}

export const GOOGLE_MISSING =
  'Google Calendar is not set up on this server (HOMA_GOOGLE_CLIENT_ID and HOMA_GOOGLE_CLIENT_SECRET). Ask your admin to add it.';

export const MICROSOFT_MISSING =
  'Microsoft calendars are not set up on this server (HOMA_MICROSOFT_CLIENT_ID and HOMA_MICROSOFT_CLIENT_SECRET). Ask your admin to add it.';

/** The provider's adapter for a connection. Google's and Microsoft's store refreshed tokens on the connection. */
export function adapterFor(
  db: Db,
  connection: repo.ConnectionRow,
  credentials: unknown,
  settings: SyncSettings,
  floatingTz: string,
): SyncAdapter {
  if (connection.provider === 'caldav') {
    const c = caldavCredentials(credentials);
    return caldavAdapter(c, { floatingTz, policy: settings.policy, provider: caldavProvider(c.serverUrl) });
  }
  if (connection.provider === 'google') {
    const client = settings.google;
    if (!client) throw new SyncError(GOOGLE_MISSING);
    const key = requireKey(settings);
    return googleAdapter(oauthCredentials(credentials), {
      floatingTz,
      client,
      policy: settings.policy,
      onCredentials: (c: GoogleCredentials): Promise<void> =>
        repo.updateConnectionCredentials(db, connection.id, encryptCredentials(key, connection.id, c)),
    });
  }
  if (connection.provider === 'microsoft') {
    const client = settings.microsoft;
    if (!client) throw new SyncError(MICROSOFT_MISSING);
    const key = requireKey(settings);
    return microsoftAdapter(oauthCredentials(credentials), {
      floatingTz,
      client,
      policy: settings.policy,
      // Microsoft rotates the refresh token: store every new pair.
      onCredentials: (c: MicrosoftCredentials): Promise<void> =>
        repo.updateConnectionCredentials(db, connection.id, encryptCredentials(key, connection.id, c)),
    });
  }
  if (connection.provider !== 'ics') throw new SyncError(`${connection.provider} connections aren't supported yet`);
  const url = (credentials as Partial<IcsCredentials> | null)?.url;
  if (typeof url !== 'string') throw new Error('ICS credentials without a URL');
  return icsAdapter({ url }, { floatingTz, policy: settings.policy });
}

/** The owner's home zone, for floating times in what the provider sends. */
export const floatingTzOf = async (db: Db, userId: string): Promise<string> =>
  (await repo.findSettings(db, userId))?.homeTz ?? 'UTC';

const cursorOf = (c: repo.CalendarRow): SyncCursor => ({
  remoteEtag: c.remoteEtag,
  remoteLastModified: c.remoteLastModified,
  contentHash: c.contentHash,
  syncToken: c.syncToken,
});

export type SyncOutcome = 'changed' | 'unchanged' | 'failed' | 'busy';

/**
 * Pulls every calendar of the connection; returns whether anything changed and conflicted titles.
 * A calendar gone at the source is marked missing (and unmarked once a pull works again).
 */
async function pullAll(
  db: Db,
  adapter: SyncAdapter,
  calendars: readonly repo.CalendarRow[],
): Promise<{ changed: boolean; conflicts: string[]; errors: unknown[] }> {
  let changed = false;
  const conflicts: string[] = [];
  const errors: unknown[] = [];
  for (const calendar of calendars) {
    try {
      const known = await repo.listRemoteState(db, calendar.id);
      const result = await adapter.pullChanges(
        { remoteId: calendar.remoteId, name: calendar.name, readOnly: calendar.readOnly },
        cursorOf(calendar),
        known,
      );
      conflicts.push(...(await db.transaction((tx) => applyPull(tx, calendar, result))));
      if (calendar.remoteMissing) await repo.setRemoteMissing(db, calendar.id, false); // access is back
      changed ||= result.kind !== 'unchanged';
    } catch (err) {
      // Gone at the source: marked for the user to remove, not a failure of the connection.
      if (err instanceof CalendarGoneError) {
        if (!calendar.remoteMissing) await repo.setRemoteMissing(db, calendar.id, true);
        continue;
      }
      // One calendar failing doesn't stop the others. Name it when the account has several.
      const named = calendars.length > 1 && expected(err);
      errors.push(named ? new SyncError(`"${calendar.name}": ${err.message}`) : err);
    }
  }
  return { changed, conflicts, errors };
}

/** Syncs one connection by id (any owner: callers check ownership). Never throws for a bad server. */
export async function syncConnection(
  db: Db,
  settings: SyncSettings,
  id: string,
  now = new Date(),
): Promise<SyncOutcome> {
  const connection = await repo.claimConnection(db, id, new Date(now.getTime() - STALE_CLAIM_MS));
  if (!connection) return 'busy';
  try {
    const credentials = credentialsOf(settings, connection);
    const calendars = await repo.listConnectionCalendars(db, [connection.id]);
    if (connection.provider === 'ics' && !calendars.length)
      throw new SyncError('The calendar for this connection is missing');
    const adapter = adapterFor(db, connection, credentials, settings, await floatingTzOf(db, connection.ownerUserId));
    const pushed = connection.provider === 'ics' ? [] : await pushOutbox(db, adapter, connection, calendars, now);
    const pulled = await pullAll(db, adapter, calendars);
    const notice = conflictNotice([...pushed, ...pulled.conflicts]);
    if (notice) await repo.setConnectionNotice(db, connection.id, notice);
    const [first] = pulled.errors;
    if (first !== undefined) throw first;
    await repo.finishSync(db, connection.id, { status: 'ok', lastError: null, lastSyncedAt: new Date() });
    return pulled.changed ? 'changed' : 'unchanged';
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

/**
 * Pushes the outbox of every connection with a due op, between full syncs, so local changes reach
 * the server within a minute or two. A connection that's syncing is skipped (its sync pushes).
 */
export async function pushDueOutboxes(
  db: Db,
  settings: SyncSettings,
  now = new Date(),
): Promise<{ connections: number; busy: number; failed: number }> {
  const counts = { connections: 0, busy: 0, failed: 0 };
  if (!settings.key) return counts;
  for (const { id } of await repo.listOutboxConnections(db, now, BATCH)) {
    const connection = await repo.claimConnection(db, id, new Date(now.getTime() - STALE_CLAIM_MS), {
      pushOnly: true,
    });
    if (!connection) {
      counts.busy++;
      continue;
    }
    try {
      const calendars = await repo.listConnectionCalendars(db, [id]);
      const adapter = adapterFor(
        db,
        connection,
        credentialsOf(settings, connection),
        settings,
        await floatingTzOf(db, connection.ownerUserId),
      );
      const notice = conflictNotice(await pushOutbox(db, adapter, connection, calendars, now));
      if (notice) await repo.setConnectionNotice(db, id, notice);
      counts.connections++;
    } catch (err) {
      // The next full sync reports the reason on the connection.
      if (expected(err)) log.warn('outbox push failed', { connectionId: id, reason: failureMessage(err) });
      else log.error('outbox push failed', { connectionId: id, ...errorFields(err) });
      counts.failed++;
    } finally {
      await repo.releaseConnection(db, id);
    }
  }
  return counts;
}
