// Connected calendars for one user: subscribe to an ICS feed (by URL or from the holiday catalog),
// list, sync now, remove. Renaming and recoloring use the calendar routes.
import { NotFoundError, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { EMPTY_CURSOR, encryptCredentials, findHolidayFeed, icsAdapter, parseFeedUrl, SyncError } from '@homa/sync';
import { applyPull, failureMessage, requireKey, syncConnection } from './sync-service';
import type { SyncSettings } from './sync-settings';

export type ConnectionView = { connection: repo.ConnectionRow; calendars: repo.CalendarRow[] };

export type SubscribeInput = ({ url: string } | { holidayId: string }) & { name?: string; color?: string };

export async function listConnections(db: Db, userId: string): Promise<ConnectionView[]> {
  const connections = await repo.listConnections(db, userId);
  const calendars = await repo.listConnectionCalendars(
    db,
    connections.map((c) => c.id),
  );
  return connections.map((connection) => ({
    connection,
    calendars: calendars.filter((c) => c.connectionId === connection.id),
  }));
}

async function view(db: Db, userId: string, id: string): Promise<ConnectionView> {
  const connection = await repo.findOwnedConnection(db, userId, id);
  if (!connection) throw new NotFoundError();
  return { connection, calendars: await repo.listConnectionCalendars(db, [id]) };
}

/** Turns a refused or unreadable feed into a 400 with the reason. */
const asValidation = (err: unknown): never => {
  if (err instanceof SyncError || err instanceof ValidationError)
    throw new ValidationError(`Couldn't subscribe: ${failureMessage(err)}`);
  throw err;
};

/**
 * Subscribes to a feed: fetches and parses it first (so a bad URL is a 400, not a broken
 * connection), then creates the connection, its read-only calendar and the events in one transaction.
 */
export async function subscribe(
  db: Db,
  settings: SyncSettings,
  userId: string,
  input: SubscribeInput,
): Promise<ConnectionView> {
  const key = requireKey(settings);
  let address: string;
  let fallbackName: string | undefined;
  if ('holidayId' in input) {
    const feed = findHolidayFeed(input.holidayId);
    if (!feed) throw new ValidationError('Unknown holiday calendar');
    address = feed.url;
    fallbackName = feed.names.en;
  } else address = input.url;

  const url = (() => {
    try {
      return parseFeedUrl(address).href;
    } catch (err) {
      return asValidation(err);
    }
  })();
  const floatingTz = (await repo.findSettings(db, userId))?.homeTz ?? 'UTC';
  const pulled = await icsAdapter({ url }, { floatingTz, policy: settings.policy })
    .pullChanges({ remoteId: null, name: null, readOnly: true }, EMPTY_CURSOR)
    .catch(asValidation);
  const feedName = pulled.kind === 'snapshot' ? pulled.name : null;

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await repo.insertConnection(tx, {
      id,
      ownerUserId: userId,
      provider: 'ics',
      credentials: encryptCredentials(key, id, { url }),
    });
    const calendar = await repo.insertCalendar(tx, userId, {
      name: input.name ?? feedName ?? fallbackName ?? new URL(url).hostname,
      ...(input.color && { color: input.color }),
      connectionId: id,
      readOnly: true,
    });
    await applyPull(tx, calendar, pulled);
    await repo.finishSync(tx, id, { status: 'ok', lastError: null, lastSyncedAt: new Date() });
  });
  return view(db, userId, id);
}

/** Syncs the user's connection now and returns it with the outcome (status and last error). */
export async function syncNow(db: Db, settings: SyncSettings, userId: string, id: string): Promise<ConnectionView> {
  await view(db, userId, id); // 404 unless it's the user's
  requireKey(settings);
  await syncConnection(db, settings, id);
  return view(db, userId, id);
}

/** Removes the connection with its calendars and their events. */
export async function deleteConnection(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteConnection(db, userId, id))) throw new NotFoundError();
}
