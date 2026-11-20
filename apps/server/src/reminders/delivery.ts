// The reminders.deliver job: finds due reminders, creates their notifications idempotently, brings
// snoozed ones back, and sends pending deliveries. See docs/design/phase-4a-reminders.md
// ("Delivery job"): one notification per occurrence and fire time (a unique dedupe key), however
// many workers, restarts or overlapping runs.
import { fireAt, nextStandaloneFire, REMINDER_LIMITS } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { errorFields, log } from '@/log';
import { channelsFor, DeliveryError, type Senders } from './channels';

const DAY_MS = 86_400_000;
const MINUTE = 60_000;
/** A claimed delivery is someone else's to retry after this. */
const LEASE_MS: number = 5 * MINUTE;
const BATCH = 100;
/** Batches one run sends at most; the rest wait a minute. */
const MAX_BATCHES = 10;
/** After this many failed tries a delivery is failed. */
export const MAX_DELIVERY_ATTEMPTS = 8;

/** Wait before try `attempts + 1`: 1, 2, 4 … minutes, at most an hour. */
export const deliveryBackoffMs = (attempts: number): number => Math.min(2 ** (attempts - 1) * MINUTE, 60 * MINUTE);

const isDue = (at: Date, now: Date): boolean => at <= now && at.getTime() > now.getTime() - REMINDER_LIMITS.catchUpMs;

/** Inserts the notifications that are new and queues their deliveries. Returns how many were new. */
async function notify(tx: Executor, rows: readonly repo.NewNotification[], now: Date): Promise<number> {
  const unique = [...new Map(rows.map((r) => [r.dedupeKey, r])).values()];
  const created = await repo.insertNotifications(tx, unique);
  const channels = await channelsFor(
    tx,
    created.map((n) => n.ownerUserId),
  );
  await repo.queueDeliveries(
    tx,
    created.flatMap((n) => (channels.get(n.ownerUserId) ?? []).map((channel) => ({ notificationId: n.id, channel }))),
    now,
  );
  return created.length;
}

/** Notifications for event reminders whose fire time is due (within the catch-up window). */
async function eventNotifications(db: Executor, now: Date): Promise<repo.NewNotification[]> {
  // Whole-day offsets and all-day events move the exact time by up to a day; the exact check is below.
  const from = new Date(now.getTime() - REMINDER_LIMITS.catchUpMs - DAY_MS);
  const to = new Date(now.getTime() + DAY_MS);
  const candidates = await repo.listEventRemindersBetween(db, from, to, REMINDER_LIMITS.maxMinutes);
  return candidates.flatMap((c) => {
    const at = fireAt({ start: c.start, allDay: c.allDay, tz: c.tz, homeTz: c.homeTz }, c.minutes);
    if (!isDue(at, now)) return [];
    return [
      {
        ownerUserId: c.ownerUserId,
        reminderId: c.reminderId,
        eventId: c.eventId,
        recurrenceId: c.recurrenceId,
        title: c.title,
        occurrenceStart: c.start,
        allDay: c.allDay,
        fireAt: at,
        dedupeKey: `event:${c.eventId}:${c.recurrenceId.toISOString()}:${at.toISOString()}`,
      },
    ];
  });
}

/** Fires due standalone reminders and moves each to its next time, under row locks. */
function fireStandalone(db: Db, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const due = await repo.claimDueStandalone(tx, now, 500);
    const rows: repo.NewNotification[] = [];
    for (const r of due) {
      if (!r.nextFireAt || !r.startsAt || !r.tz) continue;
      if (isDue(r.nextFireAt, now))
        rows.push({
          ownerUserId: r.ownerUserId,
          reminderId: r.id,
          title: r.title ?? '',
          occurrenceStart: r.nextFireAt,
          fireAt: r.nextFireAt,
          dedupeKey: `standalone:${r.id}:${r.nextFireAt.toISOString()}`,
        });
      await repo.setNextFire(tx, r.id, nextStandaloneFire({ startsAt: r.startsAt, tz: r.tz, rrule: r.rrule }, now));
    }
    return notify(tx, rows, now);
  });
}

/** Snoozed notifications whose time came: open and unread again, sent again on every channel. */
function resurface(db: Db, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const back = await repo.resurfaceSnoozed(tx, now);
    const channels = await channelsFor(
      tx,
      back.map((n) => n.ownerUserId),
    );
    await repo.queueDeliveries(
      tx,
      back.flatMap((n) => (channels.get(n.ownerUserId) ?? []).map((channel) => ({ notificationId: n.id, channel }))),
      now,
    );
    return back.length;
  });
}

/** Sends due deliveries. Each is independent: one failing waits with backoff and the rest go on. */
async function deliver(db: Db, senders: Senders, now: Date): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const claimed = await repo.claimDueDeliveries(db, now, LEASE_MS, BATCH);
    for (const d of claimed) {
      const send = senders[d.channel];
      try {
        if (!send) throw new DeliveryError(`the ${d.channel} channel is not available`, false);
        await send(db, d.notification);
        await repo.finishDelivery(db, d.id, { status: 'sent' });
        sent++;
      } catch (err) {
        const attempts = d.attempts + 1;
        const lastError = (err instanceof Error ? err.message : 'unknown error').slice(0, 500);
        if (!(err instanceof DeliveryError)) log.warn('delivery failed', { deliveryId: d.id, ...errorFields(err) });
        if ((err instanceof DeliveryError && !err.retriable) || attempts >= MAX_DELIVERY_ATTEMPTS) {
          await repo.finishDelivery(db, d.id, { status: 'failed', attempts, lastError });
          failed++;
        } else
          await repo.finishDelivery(db, d.id, {
            status: 'pending',
            attempts,
            lastError,
            nextAttemptAt: new Date(now.getTime() + deliveryBackoffMs(attempts)),
          });
      }
    }
    if (claimed.length < BATCH) break;
  }
  return { sent, failed };
}

export type DeliverResult = { notified: number; resurfaced: number; sent: number; failed: number };

/** One run of the job. Safe to run twice at once, or again after a crash. */
export async function deliverReminders(db: Db, senders: Senders, now = new Date()): Promise<DeliverResult> {
  const notified =
    (await db.transaction(async (tx) => notify(tx, await eventNotifications(tx, now), now))) +
    (await fireStandalone(db, now));
  const resurfaced = await resurface(db, now);
  return { notified, resurfaced, ...(await deliver(db, senders, now)) };
}
