// Notifications (fired reminders), their per-channel deliveries and web push subscriptions.
import { and, desc, eq, inArray, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { instanceSettings, notificationDeliveries, notifications, pushSubscriptions } from '../schema';

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

/**
 * Inserts the notifications whose dedupe key is new and returns those (an existing key is the same
 * occurrence notified before, by this run or another worker).
 */
export async function insertNotifications(db: Executor, rows: readonly NewNotification[]): Promise<NotificationRow[]> {
  if (!rows.length) return [];
  return db
    .insert(notifications)
    .values([...rows])
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();
}

/** Open notifications: not done and not snoozed past `now`, newest first. */
const open = (ownerUserId: string, now: Date): SQL | undefined =>
  and(
    eq(notifications.ownerUserId, ownerUserId),
    isNull(notifications.doneAt),
    or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
  );

export const listOpenNotifications = (
  db: Executor,
  ownerUserId: string,
  now: Date,
  limit: number,
): Promise<NotificationRow[]> =>
  db
    .select()
    .from(notifications)
    .where(open(ownerUserId, now))
    .orderBy(desc(notifications.fireAt), desc(notifications.id))
    .limit(limit);

export async function countUnread(db: Executor, ownerUserId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(open(ownerUserId, now), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markAllRead(db: Executor, ownerUserId: string, now: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(open(ownerUserId, now), isNull(notifications.readAt)));
}

/** Returns the changed row, or undefined if it isn't the owner's. */
export async function updateOwnedNotification(
  db: Executor,
  ownerUserId: string,
  id: string,
  values: { snoozedUntil?: Date | null; doneAt?: Date | null; readAt?: Date | null },
): Promise<NotificationRow | undefined> {
  const [row] = await db
    .update(notifications)
    .set(values)
    .where(and(eq(notifications.id, id), eq(notifications.ownerUserId, ownerUserId)))
    .returning();
  return row;
}

/** Snoozed notifications whose time came: unread and not snoozed again. Returns them. */
export const resurfaceSnoozed = (db: Executor, now: Date): Promise<NotificationRow[]> =>
  db
    .update(notifications)
    .set({ snoozedUntil: null, readAt: null })
    .where(and(lte(notifications.snoozedUntil, now), isNull(notifications.doneAt)))
    .returning();

// --- Deliveries ---

/** Queues (or queues again) each notification on each of its channels, due at `now`. */
export async function queueDeliveries(
  db: Executor,
  rows: readonly { notificationId: string; channel: string }[],
  now: Date,
): Promise<void> {
  if (!rows.length) return;
  await db
    .insert(notificationDeliveries)
    .values(rows.map((r) => ({ ...r, nextAttemptAt: now })))
    .onConflictDoUpdate({
      target: [notificationDeliveries.notificationId, notificationDeliveries.channel],
      set: { status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null },
    });
}

export type ClaimedDelivery = {
  id: string;
  channel: string;
  attempts: number;
  notification: NotificationRow;
};

/**
 * Claims up to `limit` pending deliveries due by `now`: moves them `leaseMs` ahead so another worker
 * (or an overlapping run) skips them while they're sent. One that is never finished retries then.
 */
export async function claimDueDeliveries(
  db: Executor,
  now: Date,
  leaseMs: number,
  limit: number,
): Promise<ClaimedDelivery[]> {
  const due = db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.status, 'pending'), lte(notificationDeliveries.nextAttemptAt, now)))
    .orderBy(notificationDeliveries.nextAttemptAt)
    .limit(limit)
    .for('update', { skipLocked: true });
  const claimed = await db
    .update(notificationDeliveries)
    .set({ nextAttemptAt: new Date(now.getTime() + leaseMs) })
    .where(inArray(notificationDeliveries.id, due))
    .returning({
      id: notificationDeliveries.id,
      channel: notificationDeliveries.channel,
      attempts: notificationDeliveries.attempts,
      notificationId: notificationDeliveries.notificationId,
    });
  if (!claimed.length) return [];
  const rows = await db
    .select()
    .from(notifications)
    .where(
      inArray(
        notifications.id,
        claimed.map((c) => c.notificationId),
      ),
    );
  const byId = new Map(rows.map((n) => [n.id, n]));
  return claimed.flatMap((c) => {
    const notification = byId.get(c.notificationId);
    return notification ? [{ id: c.id, channel: c.channel, attempts: c.attempts, notification }] : [];
  });
}

export async function finishDelivery(
  db: Executor,
  id: string,
  result:
    | { status: 'sent' }
    | { status: 'failed'; attempts: number; lastError: string }
    | { status: 'pending'; attempts: number; lastError: string; nextAttemptAt: Date },
): Promise<void> {
  await db.update(notificationDeliveries).set(result).where(eq(notificationDeliveries.id, id));
}

// --- Web push subscriptions ---

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** Saves the browser's subscription; an endpoint another account had moves to this one. */
export async function upsertPushSubscription(
  db: Executor,
  ownerUserId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ ownerUserId, ...sub })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ownerUserId, p256dh: sub.p256dh, auth: sub.auth },
    });
}

export async function deletePushSubscription(db: Executor, ownerUserId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.ownerUserId, ownerUserId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Removes a subscription the push service says is gone (404 or 410). */
export async function deletePushSubscriptionById(db: Executor, id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}

export const listPushSubscriptions = (db: Executor, ownerUserId: string): Promise<PushSubscriptionRow[]> =>
  db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerUserId, ownerUserId));

/** Which of these users have at least one push subscription. */
export async function usersWithPush(db: Executor, userIds: readonly string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db
    .selectDistinct({ id: pushSubscriptions.ownerUserId })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.ownerUserId, [...userIds]));
  return new Set(rows.map((r) => r.id));
}

// --- VAPID keys ---

export type VapidKeys = { publicKey: string; privateKey: string };

export async function findVapidKeys(db: Executor): Promise<VapidKeys | null> {
  const [row] = await db
    .select({ publicKey: instanceSettings.vapidPublicKey, privateKey: instanceSettings.vapidPrivateKey })
    .from(instanceSettings)
    .limit(1);
  return row?.publicKey && row.privateKey ? { publicKey: row.publicKey, privateKey: row.privateKey } : null;
}

/** Stores the keys only if none are stored, so two processes starting at once keep one pair. */
export async function storeVapidKeysIfUnset(db: Executor, keys: VapidKeys): Promise<void> {
  await db
    .update(instanceSettings)
    .set({ vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey })
    .where(isNull(instanceSettings.vapidPublicKey));
}
