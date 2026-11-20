// A user's notification channels, always filtered by owner where a user asks. The delivery job
// reads them across owners when it queues and sends.
import { and, asc, count, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { instanceSettings, notificationChannels, users } from '../schema';

export type ChannelRow = typeof notificationChannels.$inferSelect;
export type NewChannel = typeof notificationChannels.$inferInsert;
export type ChannelValues = Partial<Pick<NewChannel, 'name' | 'enabled' | 'reminderKinds' | 'config'>>;

export async function insertChannel(db: Executor, row: NewChannel): Promise<ChannelRow> {
  const [created] = await db.insert(notificationChannels).values(row).returning();
  if (!created) throw new Error('insert into notification_channels returned no row');
  return created;
}

const owned = (ownerUserId: string, id: string): SQL | undefined =>
  and(eq(notificationChannels.id, id), eq(notificationChannels.ownerUserId, ownerUserId));

export const listChannels = (db: Executor, ownerUserId: string): Promise<ChannelRow[]> =>
  db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.ownerUserId, ownerUserId))
    .orderBy(asc(notificationChannels.createdAt), asc(notificationChannels.id));

export async function countChannels(db: Executor, ownerUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notificationChannels)
    .where(eq(notificationChannels.ownerUserId, ownerUserId));
  return row?.n ?? 0;
}

export async function findOwnedChannel(db: Executor, ownerUserId: string, id: string): Promise<ChannelRow | undefined> {
  const [row] = await db.select().from(notificationChannels).where(owned(ownerUserId, id));
  return row;
}

export async function findChannel(db: Executor, id: string): Promise<ChannelRow | undefined> {
  const [row] = await db.select().from(notificationChannels).where(eq(notificationChannels.id, id));
  return row;
}

/** Returns the updated row, or undefined if it isn't the owner's. */
export async function updateOwnedChannel(
  db: Executor,
  ownerUserId: string,
  id: string,
  values: ChannelValues,
): Promise<ChannelRow | undefined> {
  if (!Object.keys(values).length) return findOwnedChannel(db, ownerUserId, id);
  const [row] = await db.update(notificationChannels).set(values).where(owned(ownerUserId, id)).returning();
  return row;
}

/** True if a row was deleted. */
export async function deleteOwnedChannel(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(notificationChannels)
    .where(owned(ownerUserId, id))
    .returning({ id: notificationChannels.id });
  return rows.length > 0;
}

/** The enabled channels of these owners, for queueing deliveries. */
export async function listEnabledChannels(
  db: Executor,
  ownerUserIds: readonly string[],
): Promise<Pick<ChannelRow, 'id' | 'ownerUserId' | 'reminderKinds'>[]> {
  if (!ownerUserIds.length) return [];
  return db
    .select({
      id: notificationChannels.id,
      ownerUserId: notificationChannels.ownerUserId,
      reminderKinds: notificationChannels.reminderKinds,
    })
    .from(notificationChannels)
    .where(and(inArray(notificationChannels.ownerUserId, [...ownerUserIds]), eq(notificationChannels.enabled, true)));
}

/** Records a send's result: success clears the failure count, a failure adds to it. */
export async function recordChannelResult(db: Executor, id: string, error: string | null, now: Date): Promise<void> {
  await db
    .update(notificationChannels)
    .set(
      error === null
        ? { consecutiveFailures: 0, lastError: null, lastErrorAt: null, lastSentAt: now }
        : {
            consecutiveFailures: sql`${notificationChannels.consecutiveFailures} + 1`,
            lastError: error.slice(0, 500),
            lastErrorAt: now,
          },
    )
    .where(eq(notificationChannels.id, id));
}

export type Recipient = { email: string; homeTz: string | null; language: string };

/** Who a user's messages go to and how to word them: their address, zone and the instance's language. */
export async function findRecipient(db: Executor, userId: string): Promise<Recipient | undefined> {
  const [row] = await db.select({ email: users.email, homeTz: users.homeTz }).from(users).where(eq(users.id, userId));
  if (!row) return undefined;
  const [instance] = await db.select({ language: instanceSettings.defaultLanguage }).from(instanceSettings).limit(1);
  return { ...row, language: instance?.language ?? 'en' };
}
