// Connecting a Google or Microsoft account: the OAuth 2.0 authorization code flow with PKCE (S256),
// not a sign-in. Start makes a random `state` and PKCE verifier and keeps them in a short-lived
// cookie, encrypted with the app key and bound to the signed-in user and the provider (the
// associated data), then sends the browser to the provider. The callback only goes on if that cookie
// decrypts for the same user and provider, hasn't expired and its state matches the one sent back
// (CSRF), then trades the code for tokens and saves the connection without calendars; the user
// picks them next.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { UnavailableError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import {
  decryptCredentials,
  encryptCredentials,
  exchangeGoogleCode,
  exchangeMicrosoftCode,
  type GoogleClient,
  type GoogleCredentials,
  googleAuthUrl,
  type MicrosoftClient,
  microsoftAuthUrl,
  pkcePair,
  SyncError,
} from '@homa/sync';
import { log } from '@/log';
import { failureMessage, GOOGLE_MISSING, MICROSOFT_MISSING, requireKey } from './sync-service';
import type { SyncSettings } from './sync-settings';

/** How long the user has to finish on the provider's side. */
export const OAUTH_FLOW_TTL_MS = 10 * 60_000;

export type OAuthProvider = 'google' | 'microsoft';

type Client = GoogleClient | MicrosoftClient;
type Flow = {
  client: (settings: SyncSettings) => Client | undefined;
  missing: string;
  authUrl: (client: Client, state: string, challenge: string) => string;
  exchange: (
    client: Client,
    code: string,
    verifier: string,
    now: number,
  ) => Promise<{ credentials: GoogleCredentials; email: string | null }>;
  label: string;
};

const FLOWS: Record<OAuthProvider, Flow> = {
  google: {
    client: (s: SyncSettings) => s.google,
    missing: GOOGLE_MISSING,
    authUrl: googleAuthUrl,
    exchange: exchangeGoogleCode,
    label: 'Google account',
  },
  microsoft: {
    client: (s: SyncSettings) => s.microsoft,
    missing: MICROSOFT_MISSING,
    authUrl: microsoftAuthUrl,
    exchange: exchangeMicrosoftCode,
    label: 'Microsoft account',
  },
};

type Pending = { state: string; verifier: string; expiresAt: number };

const boundTo = (provider: OAuthProvider, userId: string): string => `${provider}-oauth:${userId}`;

export function requireClient(provider: OAuthProvider, settings: SyncSettings): Client {
  const client = FLOWS[provider].client(settings);
  if (!client) throw new UnavailableError(FLOWS[provider].missing);
  return client;
}

/** Where to send the browser, and the cookie value that the callback checks. */
export function startOAuth(
  provider: OAuthProvider,
  settings: SyncSettings,
  userId: string,
  now = Date.now(),
): { url: string; cookie: string } {
  const key = requireKey(settings);
  const client = requireClient(provider, settings);
  const state = randomBytes(24).toString('base64url');
  const { verifier, challenge } = pkcePair();
  const pending: Pending = { state, verifier, expiresAt: now + OAUTH_FLOW_TTL_MS };
  return {
    url: FLOWS[provider].authUrl(client, state, challenge),
    cookie: encryptCredentials(key, boundTo(provider, userId), pending),
  };
}

export type OAuthCallback = { code?: string; state?: string; error?: string };
/** `state`: no flow of this user's to finish (a forged, stale or someone else's callback). */
export type OAuthOutcome = { connectionId: string } | { error: 'denied' | 'state' | 'failed' };

function pendingOf(
  provider: OAuthProvider,
  settings: SyncSettings,
  userId: string,
  cookie: string | undefined,
  now: number,
): Pending | null {
  if (!cookie) return null;
  try {
    const p = decryptCredentials(requireKey(settings), boundTo(provider, userId), cookie) as Partial<Pending> | null;
    if (typeof p?.state !== 'string' || typeof p.verifier !== 'string' || typeof p.expiresAt !== 'number') return null;
    return p.expiresAt > now ? { state: p.state, verifier: p.verifier, expiresAt: p.expiresAt } : null;
  } catch {
    return null; // another user's or provider's cookie, or not ours at all
  }
}

const sameState = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Finishes the flow for the signed-in user. Never throws for a bad callback: the outcome says why. */
export async function finishOAuth(
  provider: OAuthProvider,
  db: Db,
  settings: SyncSettings,
  userId: string,
  input: OAuthCallback,
  cookie: string | undefined,
  now = Date.now(),
): Promise<OAuthOutcome> {
  const key = requireKey(settings);
  const client = requireClient(provider, settings);
  const pending = pendingOf(provider, settings, userId, cookie, now);
  if (!pending || !input.state || !sameState(input.state, pending.state)) {
    log.warn(`${provider} connect refused: state mismatch`, { userId });
    return { error: 'state' };
  }
  if (input.error || !input.code) return { error: 'denied' };
  let tokens: Awaited<ReturnType<Flow['exchange']>>;
  try {
    tokens = await FLOWS[provider].exchange(client, input.code, pending.verifier, now);
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    log.warn(`${provider} connect failed`, { userId, reason: failureMessage(err) });
    return { error: 'failed' };
  }
  const id = crypto.randomUUID();
  await repo.insertConnection(db, {
    id,
    ownerUserId: userId,
    provider,
    credentials: encryptCredentials(key, id, tokens.credentials),
    label: tokens.email ?? FLOWS[provider].label,
  });
  return { connectionId: id };
}
