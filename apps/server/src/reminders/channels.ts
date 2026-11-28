// The channels a notification goes out on. In-app is the notification row itself (the bell); the
// rest each get a delivery row that the job sends and retries: `push` (every browser the user
// subscribed) and `channel:{id}` for each of the user's channels that takes the notification's kind.
import { type Db, type Executor, type ReminderKind, repo } from '@homa/db';

/** A send failed. `retriable` failures are tried again with backoff; others fail the delivery. */
export class DeliveryError extends Error {
  override name = 'DeliveryError';
  constructor(
    message: string,
    readonly retriable: boolean,
  ) {
    super(message);
  }
}

/** Sends one notification on one channel (`push`, `channel:{id}`); throws DeliveryError when it can't. */
export type Sender = (db: Db, n: repo.NotificationRow, channel: string) => Promise<void>;
/** Senders by the channel's prefix: `push`, `channel`. */
export type Senders = Readonly<Record<string, Sender>>;

/** Which kind of reminder fired a notification: an event's, a task's, or a standalone one. */
/** What a notification is about: a reminder's kind, or a poll. */
export type NotificationKind = ReminderKind | 'poll';

export const notificationKind = (n: Pick<repo.NotificationRow, 'eventId' | 'taskId' | 'pollId'>): NotificationKind =>
  n.pollId ? 'poll' : n.taskId ? 'task' : n.eventId ? 'event' : 'standalone';

/** The channel setting that covers a kind: polls go where event reminders go. */
const channelKind = (k: NotificationKind): ReminderKind => (k === 'poll' ? 'event' : k);

export const senderFor = (senders: Senders, channel: string): Sender | undefined =>
  senders[channel.split(':')[0] ?? channel];

/** The deliveries to queue for these notifications (beside in-app). */
export async function deliveriesFor(
  db: Executor,
  list: readonly Pick<repo.NotificationRow, 'id' | 'ownerUserId' | 'eventId' | 'taskId' | 'pollId'>[],
): Promise<{ notificationId: string; channel: string }[]> {
  const owners = [...new Set(list.map((n) => n.ownerUserId))];
  const withPush = await repo.usersWithPush(db, owners);
  const channels = await repo.listEnabledChannels(db, owners);
  return list.flatMap((n) => {
    const kind = channelKind(notificationKind(n));
    return [
      ...(withPush.has(n.ownerUserId) ? ['push'] : []),
      ...channels
        .filter((c) => c.ownerUserId === n.ownerUserId && c.reminderKinds.includes(kind))
        .map((c) => `channel:${c.id}`),
    ].map((channel) => ({ notificationId: n.id, channel }));
  });
}
