// Connecting a Google account: the OAuth 2.0 authorization code flow with PKCE (S256), not a
// sign-in. Start makes a random `state` and PKCE verifier and keeps them in a short-lived cookie,
// encrypted with the app key and bound to the signed-in user (the user id is the associated data),
// then sends the browser to Google. The callback only goes on if that cookie decrypts for the same
// user, hasn't expired and its state matches the one Google sent back (CSRF), then trades the code
// for tokens and saves the connection without calendars; the user picks them next.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { UnavailableError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import {
  decryptCredentials,
  encryptCredentials,
  exchangeGoogleCode,
  type GoogleClient,
  googleAuthUrl,
  pkcePair,
  SyncError,
} from '@homa/sync';
import { log } from '@/log';
import { failureMessage, GOOGLE_MISSING, requireKey } from './sync-service';
import type { SyncSettings } from './sync-settings';

/** How long the user has to finish on Google's side. */
export const GOOGLE_FLOW_TTL_MS = 10 * 60_000;

type Pending = { state: string; verifier: string; expiresAt: number };

const boundTo = (userId: string): string => `google-oauth:${userId}`;

export function requireGoogle(settings: SyncSettings): GoogleClient {
  if (!settings.google) throw new UnavailableError(GOOGLE_MISSING);
  return settings.google;
}

/** Where to send the browser, and the cookie value that the callback checks. */
export function startGoogle(settings: SyncSettings, userId: string, now = Date.now()): { url: string; cookie: string } {
  const key = requireKey(settings);
  const client = requireGoogle(settings);
  const state = randomBytes(24).toString('base64url');
  const { verifier, challenge } = pkcePair();
  const pending: Pending = { state, verifier, expiresAt: now + GOOGLE_FLOW_TTL_MS };
  return { url: googleAuthUrl(client, state, challenge), cookie: encryptCredentials(key, boundTo(userId), pending) };
}

export type GoogleCallback = { code?: string; state?: string; error?: string };
/** `state`: no flow of this user's to finish (a forged, stale or someone else's callback). */
export type GoogleOutcome = { connectionId: string } | { error: 'denied' | 'state' | 'failed' };

function pendingOf(settings: SyncSettings, userId: string, cookie: string | undefined, now: number): Pending | null {
  if (!cookie) return null;
  try {
    const p = decryptCredentials(requireKey(settings), boundTo(userId), cookie) as Partial<Pending> | null;
    if (typeof p?.state !== 'string' || typeof p.verifier !== 'string' || typeof p.expiresAt !== 'number') return null;
    return p.expiresAt > now ? { state: p.state, verifier: p.verifier, expiresAt: p.expiresAt } : null;
  } catch {
    return null; // another user's cookie, or not ours at all
  }
}

const sameState = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Finishes the flow for the signed-in user. Never throws for a bad callback: the outcome says why. */
export async function finishGoogle(
  db: Db,
  settings: SyncSettings,
  userId: string,
  input: GoogleCallback,
  cookie: string | undefined,
  now = Date.now(),
): Promise<GoogleOutcome> {
  const key = requireKey(settings);
  const client = requireGoogle(settings);
  const pending = pendingOf(settings, userId, cookie, now);
  if (!pending || !input.state || !sameState(input.state, pending.state)) {
    log.warn('google connect refused: state mismatch', { userId });
    return { error: 'state' };
  }
  if (input.error || !input.code) return { error: 'denied' };
  let tokens: Awaited<ReturnType<typeof exchangeGoogleCode>>;
  try {
    tokens = await exchangeGoogleCode(client, input.code, pending.verifier, now);
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    log.warn('google connect failed', { userId, reason: failureMessage(err) });
    return { error: 'failed' };
  }
  const id = crypto.randomUUID();
  await repo.insertConnection(db, {
    id,
    ownerUserId: userId,
    provider: 'google',
    credentials: encryptCredentials(key, id, tokens.credentials),
    label: tokens.email ?? 'Google account',
  });
  return { connectionId: id };
}
