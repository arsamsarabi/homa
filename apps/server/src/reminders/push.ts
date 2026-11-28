// Web push (VAPID). Keys come from HOMA_VAPID_* or, when unset, are generated once and kept in
// instance_settings. `web-push` only signs and encrypts the message (generateRequestDetails); Homa
// POSTs it with fetch, so the send has a timeout and the endpoint's address can be checked first.
// See docs/design/phase-4a-reminders.md ("Web push and VAPID").
import { UnavailableError, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { assertPublicHost, SyncError } from '@homa/sync';
import webpush from 'web-push';
import type { Config } from '@/config';
import { log } from '@/log';
import { DeliveryError, type NotificationKind, notificationKind } from './channels';

export type Vapid = { publicKey: string; privateKey: string; subject: string };

export type PushSettings = {
  /** The instance's VAPID keys (read or generated on first use). */
  vapid: () => Promise<Vapid>;
  /** Allow endpoints on loopback and private networks (tests): HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS. */
  allowPrivate: boolean;
};

const TIMEOUT_MS = 10_000;
/** How long a push service keeps a message for an offline browser. */
const TTL_SECONDS = 4 * 3600;

/** The keys from the environment, or the stored ones (generated and stored the first time). */
async function loadVapid(db: Db, config: Config): Promise<Vapid> {
  const subject =
    config.HOMA_VAPID_SUBJECT ?? (config.HOMA_URL.startsWith('https://') ? config.HOMA_URL : 'mailto:admin@localhost');
  if (config.HOMA_VAPID_PUBLIC_KEY && config.HOMA_VAPID_PRIVATE_KEY)
    return { publicKey: config.HOMA_VAPID_PUBLIC_KEY, privateKey: config.HOMA_VAPID_PRIVATE_KEY, subject };
  let keys = await repo.findVapidKeys(db);
  if (!keys) {
    // Only stored if none are yet, so the API and the worker starting together keep one pair.
    await repo.storeVapidKeysIfUnset(db, webpush.generateVAPIDKeys());
    keys = await repo.findVapidKeys(db);
    if (!keys) throw new Error('could not store the VAPID keys');
    log.info('generated web push (VAPID) keys');
  }
  return { ...keys, subject };
}

/** Push settings that load the keys on first use, and again after a failure (the worker may start before migrations). */
export function pushSettingsFrom(db: Db, config: Config): PushSettings {
  let loading: Promise<Vapid> | undefined;
  return {
    allowPrivate: config.HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS,
    vapid: (): Promise<Vapid> => {
      loading ??= loadVapid(db, config).catch((err: unknown) => {
        loading = undefined;
        throw err;
      });
      return loading;
    },
  };
}

/** Throws ValidationError unless the endpoint is https (or http with private networks allowed). */
function checkEndpoint(endpoint: string, push: PushSettings): void {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(push.allowPrivate && url.protocol === 'http:'))
    throw new ValidationError('A push endpoint must be an https address');
}

export async function publicKey(push: PushSettings | undefined): Promise<string> {
  if (!push) throw new UnavailableError('Web push is not set up on this server');
  return (await push.vapid()).publicKey;
}

export async function subscribe(
  db: Db,
  push: PushSettings | undefined,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  if (!push) throw new UnavailableError('Web push is not set up on this server');
  checkEndpoint(sub.endpoint, push);
  await repo.upsertPushSubscription(db, userId, { endpoint: sub.endpoint, ...sub.keys });
}

export const unsubscribe = (db: Db, userId: string, endpoint: string): Promise<void> =>
  repo.deletePushSubscription(db, userId, endpoint);

/** What the service worker gets: it formats the time in the browser's locale. */
export type PushPayload = { id: string; title: string; startAt: string; allDay: boolean; kind: NotificationKind };

export const payloadOf = (n: repo.NotificationRow): PushPayload => ({
  id: n.id,
  title: n.title,
  startAt: n.occurrenceStart.toISOString(),
  allDay: n.allDay,
  kind: notificationKind(n),
});

/** Sends one message to one subscription. Returns the push service's status. */
async function sendOne(
  sub: repo.PushSubscriptionRow,
  body: string,
  vapid: Vapid,
  allowPrivate: boolean,
): Promise<number> {
  const url = new URL(sub.endpoint);
  try {
    await assertPublicHost(url, allowPrivate);
  } catch (err) {
    if (err instanceof SyncError) return 400; // a refused address: like the push service refusing it
    throw err;
  }
  const details = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    body,
    {
      vapidDetails: vapid,
      TTL: TTL_SECONDS,
      urgency: 'high',
    },
  );
  const res = await fetch(details.endpoint, {
    method: 'POST',
    headers: details.headers as Record<string, string>,
    body: details.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await res.body?.cancel();
  return res.status;
}

/**
 * Pushes the notification to each of the owner's browsers. A 404 or 410 means the browser
 * unsubscribed: the subscription is removed. Throws a retriable DeliveryError when none got it
 * and one may later (a network error, 429, 5xx).
 * shortcut: one browser failing while another got it counts as sent, so nobody gets it twice;
 * track deliveries per subscription if that turns out to lose messages.
 */
export async function sendPush(db: Db, push: PushSettings, n: repo.NotificationRow): Promise<void> {
  const subs = await repo.listPushSubscriptions(db, n.ownerUserId);
  if (!subs.length) return;
  const vapid = await push.vapid();
  const body = JSON.stringify(payloadOf(n));
  let sent = 0;
  let retriable: string | undefined;
  let refused: string | undefined;
  for (const sub of subs) {
    let status: number;
    try {
      status = await sendOne(sub, body, vapid, push.allowPrivate);
    } catch (err) {
      retriable = err instanceof Error ? err.message : 'network error';
      continue;
    }
    if (status >= 200 && status < 300) sent++;
    else if (status === 404 || status === 410) await repo.deletePushSubscriptionById(db, sub.id);
    else if (status === 429 || status >= 500) retriable = `the push service answered ${status}`;
    else refused = `the push service answered ${status}`;
  }
  if (sent) return;
  if (retriable) throw new DeliveryError(retriable, true);
  if (refused) throw new DeliveryError(refused, false);
}
