// Sending one message on one channel (email, ntfy, Gotify, webhook), and recording the result on the
// channel so Settings can show one that keeps failing. See docs/design/phase-4b-channels.md.
import { createHmac } from 'node:crypto';
import { type Db, type Executor, type ReminderKind, repo } from '@homa/db';
import { DeliveryError, notificationKind, type Sender } from '@/reminders/channels';
import { type ChannelConfig, type GotifyConfig, type NtfyConfig, openConfig, type WebhookConfig } from './config';
import { postJson } from './http';
import { type Message, reminderMail, reminderMessage } from './message';
import type { NotifySettings } from './settings';

/** What a webhook receives. */
export type WebhookPayload = {
  type: 'reminder' | 'test';
  id: string;
  title: string;
  startAt: string;
  allDay: boolean;
  kind: ReminderKind;
  fireAt: string;
  url: string;
};

export type Outgoing = { message: Message; payload: WebhookPayload };

/** SMTP: no answer or a 4xx reply may work later; a 5xx reply won't. */
function mailError(err: unknown): DeliveryError {
  const code = (err as { responseCode?: unknown }).responseCode;
  if (typeof code === 'number') return new DeliveryError(`the mail server answered ${code}`, code < 500);
  return new DeliveryError('the mail server could not be reached', true);
}

function config(s: NotifySettings, ch: repo.ChannelRow): ChannelConfig {
  if (ch.kind === 'email' || !ch.config) throw new DeliveryError('the channel has no settings', false);
  if (!s.key) throw new DeliveryError('HOMA_ENCRYPTION_KEY is not set on this server', false);
  try {
    return openConfig(s.key, ch.id, ch.kind, ch.config);
  } catch {
    throw new DeliveryError("the channel's settings can't be read (did HOMA_ENCRYPTION_KEY change?)", false);
  }
}

/** Gotify's API is under its base address, which may have a path. */
const under = (base: string, path: string): URL => new URL(path, base.endsWith('/') ? base : `${base}/`);

/** Sends on one channel; throws DeliveryError when it can't. */
export async function sendOn(
  s: NotifySettings,
  ch: repo.ChannelRow,
  to: repo.Recipient,
  out: Outgoing,
  now: Date,
): Promise<void> {
  const { message: m } = out;
  if (ch.kind === 'email') {
    if (!s.sendMail) throw new DeliveryError('email is not set up on this server', false);
    try {
      await s.sendMail(reminderMail(m, s.appUrl, to));
    } catch (err) {
      throw mailError(err);
    }
    return;
  }
  if (ch.kind === 'ntfy') {
    const c = config(s, ch) as NtfyConfig;
    const body = { topic: c.topic, title: m.title, message: m.body, click: s.appUrl, tags: ['bell'] };
    await postJson(
      new URL(c.server),
      JSON.stringify(body),
      c.token ? { authorization: `Bearer ${c.token}` } : {},
      s.allowPrivate,
    );
    return;
  }
  if (ch.kind === 'gotify') {
    const c = config(s, ch) as GotifyConfig;
    const body = {
      title: m.title,
      message: m.body,
      priority: 5,
      extras: { 'client::notification': { click: { url: s.appUrl } } },
    };
    await postJson(under(c.server, 'message'), JSON.stringify(body), { 'x-gotify-key': c.token }, s.allowPrivate);
    return;
  }
  const c = config(s, ch) as WebhookConfig;
  const body = JSON.stringify(out.payload);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = createHmac('sha256', c.secret).update(`${timestamp}.${body}`).digest('hex');
  await postJson(
    new URL(c.url),
    body,
    { 'x-homa-timestamp': timestamp, 'x-homa-signature': `sha256=${signature}`, 'x-homa-event': out.payload.type },
    s.allowPrivate,
  );
}

/** Sends, and records the result on the channel. Rethrows the failure. */
export async function sendAndRecord(
  db: Executor,
  s: NotifySettings,
  ch: repo.ChannelRow,
  to: repo.Recipient,
  out: Outgoing,
  now = new Date(),
): Promise<void> {
  try {
    await sendOn(s, ch, to, out, now);
  } catch (err) {
    await repo.recordChannelResult(db, ch.id, err instanceof Error ? err.message : 'unknown error', now);
    throw err;
  }
  await repo.recordChannelResult(db, ch.id, null, now);
}

export const payloadOf = (n: repo.NotificationRow, appUrl: string): WebhookPayload => ({
  type: 'reminder',
  id: n.id,
  title: n.title,
  startAt: n.occurrenceStart.toISOString(),
  allDay: n.allDay,
  kind: notificationKind(n),
  fireAt: n.fireAt.toISOString(),
  url: appUrl,
});

/** The job's sender for `channel:{id}` deliveries. */
export function channelSender(s: NotifySettings): Sender {
  return async (db: Db, n: repo.NotificationRow, key: string): Promise<void> => {
    const ch = await repo.findChannel(db, key.slice('channel:'.length));
    if (!ch || ch.ownerUserId !== n.ownerUserId || !ch.enabled)
      throw new DeliveryError('the channel was removed or turned off', false);
    const to = await repo.findRecipient(db, n.ownerUserId);
    if (!to) throw new DeliveryError('the account is gone', false);
    await sendAndRecord(db, s, ch, to, { message: reminderMessage(n, to), payload: payloadOf(n, s.appUrl) });
  };
}
