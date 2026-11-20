// Google OAuth 2.0 for a calendar connection (not a sign-in): the authorization code flow with
// PKCE (S256), offline access for a refresh token, and token refresh. Plain fetch against Google's
// endpoints, each call with its own timeout. Tokens are never put in an error message.
import { createHash, randomBytes } from 'node:crypto';
import { readCapped, SyncError } from '../feed';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const SCOPES: readonly string[] = ['openid', 'email', GOOGLE_CALENDAR_SCOPE];

export type GoogleEndpoints = { auth: string; token: string; api: string };

export const GOOGLE_ENDPOINTS: GoogleEndpoints = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  api: 'https://www.googleapis.com/calendar/v3',
};

/** The instance's OAuth client (HOMA_GOOGLE_CLIENT_ID and _SECRET) and where Google sends users back. */
export type GoogleClient = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Tests point these at a fake server. */
  endpoints?: GoogleEndpoints;
};

/** What a Google connection stores, encrypted. `expiresAt` is the access token's expiry (epoch ms). */
export type GoogleCredentials = { accessToken: string; refreshToken: string; expiresAt: number };

export const RECONNECT_GOOGLE =
  "Google no longer accepts Homa's access to this account. Remove the connection and connect Google again.";

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 1024 * 1024;

export const endpointsOf = (client: GoogleClient): GoogleEndpoints => client.endpoints ?? GOOGLE_ENDPOINTS;

/** A PKCE verifier and its S256 challenge (RFC 7636). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Where to send the user to grant access: offline (a refresh token) and always asking for consent. */
export function googleAuthUrl(client: GoogleClient, state: string, challenge: string): string {
  const url = new URL(endpointsOf(client).auth);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.href;
}

type TokenAnswer = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
};

async function tokenRequest(client: GoogleClient, params: Record<string, string>): Promise<TokenAnswer> {
  let res: Response;
  try {
    res = await fetch(endpointsOf(client).token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncError("Couldn't reach Google");
  }
  const text = await readCapped(res, MAX_BYTES, "Google's answer");
  let body: TokenAnswer;
  try {
    body = JSON.parse(text) as TokenAnswer;
  } catch {
    throw new SyncError(`Google answered ${res.status}`);
  }
  if (body.error === 'invalid_grant') throw new SyncError(RECONNECT_GOOGLE);
  if (!res.ok || !body.access_token) throw new SyncError(`Google refused the request (${body.error ?? res.status})`);
  return body;
}

const expiry = (answer: TokenAnswer, now: number): number => now + (answer.expires_in ?? 3600) * 1000;

/** The account's email from an ID token straight from Google's token endpoint (TLS vouches for it, OIDC §3.1.3.7). */
function emailOf(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const email = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown }).email;
    return typeof email === 'string' ? email.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/**
 * Trades the code from the callback for tokens. Throws SyncError when Google refuses, when there's
 * no refresh token, or when the user didn't grant the calendar scope.
 */
export async function exchangeGoogleCode(
  client: GoogleClient,
  code: string,
  verifier: string,
  now = Date.now(),
): Promise<{ credentials: GoogleCredentials; email: string | null }> {
  const answer = await tokenRequest(client, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: client.redirectUri,
  });
  if (!answer.scope?.split(' ').includes(GOOGLE_CALENDAR_SCOPE))
    throw new SyncError('Homa needs access to your calendars. Connect again and allow it.');
  if (!answer.refresh_token || !answer.access_token) throw new SyncError("Google didn't send a refresh token");
  return {
    credentials: {
      accessToken: answer.access_token,
      refreshToken: answer.refresh_token,
      expiresAt: expiry(answer, now),
    },
    email: emailOf(answer.id_token),
  };
}

/** A new access token for `credentials`. Throws SyncError(RECONNECT_GOOGLE) on invalid_grant. */
export async function refreshGoogleToken(
  client: GoogleClient,
  credentials: GoogleCredentials,
  now = Date.now(),
): Promise<GoogleCredentials> {
  const answer = await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
  return {
    accessToken: answer.access_token ?? '',
    // Google keeps the refresh token unless it sends a new one.
    refreshToken: answer.refresh_token ?? credentials.refreshToken,
    expiresAt: expiry(answer, now),
  };
}
