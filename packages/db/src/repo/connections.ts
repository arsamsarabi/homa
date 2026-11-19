// Connections to external calendars. User-facing reads and deletes filter by owner; the sync
// worker reads and claims by id.
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { type ConnectionProvider, type ConnectionStatus, connections } from '../schema';

export type ConnectionRow = typeof connections.$inferSelect;

export async function insertConnection(
  db: Executor,
  values: { id: string; ownerUserId: string; provider: ConnectionProvider; credentials: string },
): Promise<ConnectionRow> {
  const [row] = await db.insert(connections).values(values).returning();
  if (!row) throw new Error('insert into connections returned no row');
  return row;
}

export const listConnections = (db: Executor, ownerUserId: string): Promise<ConnectionRow[]> =>
  db
    .select()
    .from(connections)
    .where(eq(connections.ownerUserId, ownerUserId))
    .orderBy(asc(connections.createdAt), asc(connections.id));

export async function findOwnedConnection(
  db: Executor,
  ownerUserId: string,
  id: string,
): Promise<ConnectionRow | undefined> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.ownerUserId, ownerUserId)));
  return row;
}

/** Deletes the connection; its calendars and their events cascade. False if it isn't the owner's. */
export async function deleteConnection(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(connections)
    .where(and(eq(connections.id, id), eq(connections.ownerUserId, ownerUserId)))
    .returning({ id: connections.id });
  return rows.length > 0;
}

export async function countConnections(db: Executor): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(connections);
  return row?.n ?? 0;
}

/**
 * Marks the connection as syncing, unless another sync holds it (claimed after `staleBefore`).
 * Returns the row when this caller got it, so two syncs of one connection never run at once.
 */
export async function claimConnection(db: Executor, id: string, staleBefore: Date): Promise<ConnectionRow | undefined> {
  const [row] = await db
    .update(connections)
    .set({ status: 'syncing', syncStartedAt: sql`now()` })
    .where(
      and(eq(connections.id, id), or(isNull(connections.syncStartedAt), lt(connections.syncStartedAt, staleBefore))),
    )
    .returning();
  return row;
}

/** Records how a sync ended and releases the claim. */
export async function finishSync(
  db: Executor,
  id: string,
  result: { status: Extract<ConnectionStatus, 'ok' | 'error'>; lastError: string | null; lastSyncedAt: Date },
): Promise<void> {
  await db
    .update(connections)
    .set({ ...result, syncStartedAt: null })
    .where(eq(connections.id, id));
}

/** Ids of connections last synced before `before` (or never), oldest first, that no sync holds. */
export const listDueConnections = (db: Executor, before: Date, limit: number): Promise<{ id: string }[]> =>
  db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        isNull(connections.syncStartedAt),
        or(isNull(connections.lastSyncedAt), lt(connections.lastSyncedAt, before)),
      ),
    )
    .orderBy(sql`${connections.lastSyncedAt} asc nulls first`)
    .limit(limit);
