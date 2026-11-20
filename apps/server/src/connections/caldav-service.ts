// CalDAV connections: add an account (server URL, user name, app password). For CalDAV and Google
// accounts alike: list the calendars on it, and choose which of them sync. Each chosen calendar
// becomes a local calendar tied to its remote id; one the user can't write to on the server stays
// read-only here. Unchoosing a calendar removes the local copy only, never anything on the server.
import { NotFoundError, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import {
  type CaldavCredentials,
  caldavAdapter,
  encryptCredentials,
  parseFeedUrl,
  type RemoteCalendar,
  SyncError,
} from '@homa/sync';
import { type ConnectionView, view } from './connections-service';
import { adapterFor, credentialsOf, failureMessage, floatingTzOf, requireKey, syncConnection } from './sync-service';
import type { SyncSettings } from './sync-settings';

export type CaldavInput = { serverUrl: string; username: string; password: string };
export type RemoteCalendarView = RemoteCalendar & { remoteId: string; selected: boolean; missing: boolean };

const asValidation = (err: unknown): never => {
  if (err instanceof SyncError || err instanceof ValidationError)
    throw new ValidationError(`Couldn't connect: ${failureMessage(err)}`);
  throw err;
};

/**
 * Checks the account (discovery finds its calendar home) and saves it. The connection starts
 * without calendars; the user picks them next.
 */
export async function addCaldav(
  db: Db,
  settings: SyncSettings,
  userId: string,
  input: CaldavInput,
): Promise<ConnectionView> {
  const key = requireKey(settings);
  let server: URL;
  try {
    server = parseFeedUrl(input.serverUrl);
  } catch (err) {
    return asValidation(err);
  }
  const credentials: CaldavCredentials = { serverUrl: server.href, username: input.username, password: input.password };
  const adapter = caldavAdapter(credentials, { floatingTz: await floatingTzOf(db, userId), policy: settings.policy });
  credentials.homeUrl = await adapter.discover().catch(asValidation);
  await adapter.listCalendars().catch(asValidation);

  const id = crypto.randomUUID();
  await repo.insertConnection(db, {
    id,
    ownerUserId: userId,
    provider: 'caldav',
    credentials: encryptCredentials(key, id, credentials),
    label: `${input.username} on ${server.hostname}`,
  });
  return view(db, userId, id);
}

/** The user's CalDAV or Google connection (the ones with calendars to choose). */
async function accountConnection(db: Db, userId: string, id: string): Promise<repo.ConnectionRow> {
  const connection = await repo.findOwnedConnection(db, userId, id);
  if (!connection) throw new NotFoundError();
  if (connection.provider !== 'caldav' && connection.provider !== 'google')
    throw new ValidationError('Only CalDAV and Google connections have calendars to choose');
  return connection;
}

async function remoteList(db: Db, settings: SyncSettings, connection: repo.ConnectionRow): Promise<RemoteCalendar[]> {
  try {
    const adapter = adapterFor(
      db,
      connection,
      credentialsOf(settings, connection),
      settings,
      await floatingTzOf(db, connection.ownerUserId),
    );
    return await adapter.listCalendars();
  } catch (err) {
    return asValidation(err);
  }
}

/** A name for a remote calendar without one: the last path segment of a CalDAV URL, else "Calendar". */
function fallbackName(remoteId: string): string {
  try {
    return new URL(remoteId).pathname.split('/').filter(Boolean).at(-1) || 'Calendar';
  } catch {
    return 'Calendar';
  }
}

/**
 * The account's calendars on the server, with the ones that sync marked, then the synced ones the
 * server no longer has (marked missing).
 */
export async function listRemoteCalendars(
  db: Db,
  settings: SyncSettings,
  userId: string,
  id: string,
): Promise<RemoteCalendarView[]> {
  const connection = await accountConnection(db, userId, id);
  const local = await repo.listConnectionCalendars(db, [id]);
  const synced = new Set(local.map((c) => c.remoteId));
  const remote = (await remoteList(db, settings, connection)).flatMap((c) =>
    c.remoteId ? [{ ...c, remoteId: c.remoteId, selected: synced.has(c.remoteId), missing: false }] : [],
  );
  const listed = new Set(remote.map((c) => c.remoteId));
  const gone = local.flatMap((c) =>
    c.remoteId && c.remoteMissing && !listed.has(c.remoteId)
      ? [{ remoteId: c.remoteId, name: c.name, color: c.color, readOnly: c.readOnly, selected: true, missing: true }]
      : [],
  );
  return [...remote, ...gone];
}

/**
 * Makes exactly `remoteIds` sync: new ones get a local calendar (named and colored as on the
 * server) and are pulled; dropped ones lose their local calendar and events. Returns the connection.
 */
export async function chooseCalendars(
  db: Db,
  settings: SyncSettings,
  userId: string,
  id: string,
  remoteIds: readonly string[],
): Promise<ConnectionView> {
  const connection = await accountConnection(db, userId, id);
  const remote = new Map((await remoteList(db, settings, connection)).map((c) => [c.remoteId, c]));
  const wanted = new Set(remoteIds);
  const local = await repo.listConnectionCalendars(db, [id]);
  // A calendar already synced may stay chosen even when the server no longer lists it.
  const synced = new Set(local.map((c) => c.remoteId));
  for (const remoteId of wanted)
    if (!remote.has(remoteId) && !synced.has(remoteId)) throw new ValidationError('Unknown calendar on this account');
  await db.transaction(async (tx) => {
    for (const c of local) if (!c.remoteId || !wanted.has(c.remoteId)) await repo.deleteCalendar(tx, userId, c.id);
    const have = new Set(local.map((c) => c.remoteId));
    for (const remoteId of wanted) {
      const c = remote.get(remoteId);
      if (!c || have.has(remoteId)) continue;
      await repo.insertCalendar(tx, userId, {
        name: (c.name ?? '').slice(0, 100) || fallbackName(remoteId),
        ...(c.color && { color: c.color }),
        connectionId: id,
        readOnly: c.readOnly,
        remoteId,
      });
    }
  });
  await syncConnection(db, settings, id);
  return view(db, userId, id);
}
