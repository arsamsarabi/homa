// The channels a notification goes out on. In-app is the notification row itself (the bell); the
// rest each get a delivery row that the job sends and retries. Phase 4a has web push.
import { type Db, type Executor, repo } from '@homa/db';

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

/** Sends one notification on one channel; throws DeliveryError when it can't. */
export type Sender = (db: Db, n: repo.NotificationRow) => Promise<void>;
export type Senders = Readonly<Record<string, Sender>>;

/** The delivery channels each owner's new notifications go out on (beside in-app). */
export async function channelsFor(db: Executor, ownerIds: readonly string[]): Promise<Map<string, string[]>> {
  const withPush = await repo.usersWithPush(db, [...new Set(ownerIds)]);
  return new Map(ownerIds.map((id) => [id, withPush.has(id) ? ['push'] : []]));
}
