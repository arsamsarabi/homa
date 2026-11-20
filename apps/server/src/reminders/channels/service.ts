// A user's notification channels: add, change, remove and test them. Configs are encrypted; the
// answer never includes tokens or a webhook's full address. See docs/design/phase-4b-channels.md.
import { randomBytes } from 'node:crypto';
import { NotFoundError, UnavailableError, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import { DeliveryError } from '@/reminders/channels';
import {
  type ChannelConfig,
  checkAddress,
  GotifyConfig,
  NtfyConfig,
  openConfig,
  sealConfig,
  WebhookConfig,
} from './config';
import { testMessage } from './message';
import type { Channel, ChannelInput, ChannelPatch } from './schemas';
import { sendAndRecord, type WebhookPayload } from './senders';
import type { NotifySettings } from './settings';

export const MAX_CHANNELS = 10;
/** Settings shows a channel as failing after this many failures in a row. */
export const FAILING_AFTER = 3;

type Out = z.infer<typeof Channel>;

const newSecret = (): string => randomBytes(32).toString('base64url');

function need(s: NotifySettings | undefined): NotifySettings {
  if (!s) throw new UnavailableError('Notification channels are not set up on this server');
  return s;
}

function needKey(s: NotifySettings): NonNullable<NotifySettings['key']> {
  if (!s.key)
    throw new UnavailableError('Set HOMA_ENCRYPTION_KEY on the server to add ntfy, Gotify or webhook channels');
  return s.key;
}

function readConfig(s: NotifySettings, ch: repo.ChannelRow): ChannelConfig | undefined {
  if (ch.kind === 'email' || !ch.config || !s.key) return undefined;
  try {
    return openConfig(s.key, ch.id, ch.kind, ch.config);
  } catch {
    return undefined; // a changed key: the channel shows without its details, and its sends fail
  }
}

export function channelOut(s: NotifySettings, ch: repo.ChannelRow, secret?: string): Out {
  const c = readConfig(s, ch) as Partial<NtfyConfig & WebhookConfig> | undefined;
  return {
    id: ch.id,
    kind: ch.kind,
    name: ch.name,
    enabled: ch.enabled,
    reminderKinds: ch.reminderKinds,
    server: c?.server ?? null,
    topic: c?.topic ?? null,
    host: c?.url ? new URL(c.url).host : null,
    hasToken: Boolean(c?.token),
    failing: ch.consecutiveFailures >= FAILING_AFTER,
    lastError: ch.lastError,
    lastErrorAt: ch.lastErrorAt?.toISOString() ?? null,
    lastSentAt: ch.lastSentAt?.toISOString() ?? null,
    createdAt: ch.createdAt.toISOString(),
    ...(secret && { secret }),
  };
}

export async function listChannels(
  db: Db,
  settings: NotifySettings | undefined,
  userId: string,
): Promise<{ items: Out[]; email: boolean }> {
  const s = need(settings);
  return { items: (await repo.listChannels(db, userId)).map((ch) => channelOut(s, ch)), email: Boolean(s.sendMail) };
}

/** The config for a new channel, with its addresses checked. */
async function configOf(s: NotifySettings, input: z.infer<typeof ChannelInput>): Promise<ChannelConfig | undefined> {
  if (input.kind === 'email') {
    if (!s.sendMail) throw new ValidationError('Email is not set up on this server');
    return undefined;
  }
  if (input.kind === 'ntfy')
    return {
      server: (await checkAddress(input.server, s.allowPrivate)).href,
      topic: input.topic,
      ...(input.token && { token: input.token }),
    };
  if (input.kind === 'gotify')
    return { server: (await checkAddress(input.server, s.allowPrivate)).href, token: input.token };
  return { url: (await checkAddress(input.url, s.allowPrivate)).href, secret: newSecret() };
}

export async function createChannel(
  db: Db,
  settings: NotifySettings | undefined,
  userId: string,
  input: z.infer<typeof ChannelInput>,
): Promise<Out> {
  const s = need(settings);
  const config = await configOf(s, input);
  const key = config ? needKey(s) : undefined;
  return db.transaction(async (tx) => {
    if ((await repo.countChannels(tx, userId)) >= MAX_CHANNELS)
      throw new ValidationError(`You can have at most ${MAX_CHANNELS} channels`);
    const id = crypto.randomUUID();
    const row = await repo.insertChannel(tx, {
      id,
      ownerUserId: userId,
      kind: input.kind,
      name: input.name,
      ...(input.reminderKinds && { reminderKinds: input.reminderKinds }),
      config: key && config ? sealConfig(key, id, config) : null,
    });
    return channelOut(s, row, config && 'secret' in config ? config.secret : undefined);
  });
}

export async function updateChannel(
  db: Db,
  settings: NotifySettings | undefined,
  userId: string,
  id: string,
  patch: z.infer<typeof ChannelPatch>,
): Promise<Out> {
  const s = need(settings);
  const ch = await repo.findOwnedChannel(db, userId, id);
  if (!ch) throw new NotFoundError();
  const { name, enabled, reminderKinds, server, topic, token, url, rotateSecret } = patch;
  const values: repo.ChannelValues = { name, enabled, reminderKinds };
  let secret: string | undefined;
  const touchesConfig = [server, topic, token, url, rotateSecret].some((v) => v !== undefined);
  if (touchesConfig && ch.kind !== 'email') {
    const key = needKey(s);
    const old = readConfig(s, ch);
    if (!old) throw new ValidationError("This channel's settings can't be read: remove it and add it again");
    const next: Record<string, unknown> = { ...old };
    if (server !== undefined && ch.kind !== 'webhook') next.server = (await checkAddress(server, s.allowPrivate)).href;
    if (topic !== undefined && ch.kind === 'ntfy') next.topic = topic;
    if (token !== undefined && ch.kind !== 'webhook') {
      if (token === null && ch.kind === 'gotify') throw new ValidationError('Gotify needs an app token');
      if (token === null) delete next.token;
      else next.token = token;
    }
    if (url !== undefined && ch.kind === 'webhook') next.url = (await checkAddress(url, s.allowPrivate)).href;
    if (rotateSecret && ch.kind === 'webhook') {
      secret = newSecret();
      next.secret = secret;
    }
    values.config = sealConfig(key, ch.id, openConfigShape(ch.kind, next));
  }
  const defined = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as repo.ChannelValues;
  const row = await repo.updateOwnedChannel(db, userId, id, defined);
  if (!row) throw new NotFoundError();
  return channelOut(s, row, secret);
}

const PARSE = {
  ntfy: (v: unknown): ChannelConfig => NtfyConfig.parse(v),
  gotify: (v: unknown): ChannelConfig => GotifyConfig.parse(v),
  webhook: (v: unknown): ChannelConfig => WebhookConfig.parse(v),
} as const;

/** Re-checks a changed config against its kind's schema. */
function openConfigShape(
  kind: Exclude<repo.ChannelRow['kind'], 'email'>,
  value: Record<string, unknown>,
): ChannelConfig {
  return PARSE[kind](value);
}

export async function deleteChannel(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteOwnedChannel(db, userId, id))) throw new NotFoundError();
}

/** Sends a test message now. The result is recorded on the channel like a delivery's. */
export async function testChannel(
  db: Db,
  settings: NotifySettings | undefined,
  userId: string,
  id: string,
  now = new Date(),
): Promise<{ ok: boolean; error?: string }> {
  const s = need(settings);
  const ch = await repo.findOwnedChannel(db, userId, id);
  const to = await repo.findRecipient(db, userId);
  if (!ch || !to) throw new NotFoundError();
  const message = testMessage(to);
  const payload: WebhookPayload = {
    type: 'test',
    id: crypto.randomUUID(),
    title: message.title,
    startAt: now.toISOString(),
    allDay: false,
    kind: 'standalone',
    fireAt: now.toISOString(),
    url: s.appUrl,
  };
  try {
    await sendAndRecord(db, s, ch, to, { message, payload }, now);
    return { ok: true };
  } catch (err) {
    if (err instanceof DeliveryError) return { ok: false, error: err.message };
    throw err;
  }
}
