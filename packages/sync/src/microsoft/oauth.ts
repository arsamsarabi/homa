// Microsoft identity platform (v2.0 endpoints, tenant `common`: work, school and personal accounts)
// for a calendar connection, not a sign-in: the authorization code flow with PKCE (S256) and a client
// secret (a confidential web app), offline_access for a refresh token, and refresh. Microsoft rotates
// refresh tokens: every refresh answers with a new one, which replaces the stored one. Plain fetch,
// each call with its own timeout. Tokens are never put in an error message.
import { readCapped, SyncError } from '../feed';

const SCOPES: readonly string[] = ['offline_access', 'openid', 'email', 'User.Read', 'Calendars.ReadWrite'];

export type MicrosoftEndpoints = { auth: string; token: string; api: string };

export const MICROSOFT_ENDPOINTS: MicrosoftEndpoints = {
  auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  api: 'https://graph.microsoft.com/v1.0',
};

/** The instance's Entra ID app (HOMA_MICROSOFT_CLIENT_ID and _SECRET) and where Microsoft sends users back. */
export type MicrosoftClient = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Tests point these at a fake server. */
  endpoints?: MicrosoftEndpoints;
};

/** What a Microsoft connection stores, encrypted. `expiresAt` is the access token's expiry (epoch ms). */
export type MicrosoftCredentials = { accessToken: string; refreshToken: string; expiresAt: number };

export const RECONNECT_MICROSOFT =
  "Microsoft no longer accepts Homa's access to this account. Remove the connection and connect Microsoft again.";

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 1024 * 1024;

export const microsoftEndpointsOf = (client: MicrosoftClient): MicrosoftEndpoints =>
  client.endpoints ?? MICROSOFT_ENDPOINTS;

/** Where to send the user to grant access; `select_account` so someone with several accounts picks one. */
export function microsoftAuthUrl(client: MicrosoftClient, state: string, challenge: string): string {
  const url = new URL(microsoftEndpointsOf(client).auth);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: SCOPES.join(' '),
    prompt: 'select_account',
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

/** The refresh token is revoked, expired (90 days unused) or needs the user again (consent, MFA). */
const NEEDS_USER = new Set(['invalid_grant', 'interaction_required', 'consent_required', 'login_required']);

async function tokenRequest(client: MicrosoftClient, params: Record<string, string>): Promise<TokenAnswer> {
  let res: Response;
  try {
    res = await fetch(microsoftEndpointsOf(client).token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncError("Couldn't reach Microsoft");
  }
  const text = await readCapped(res, MAX_BYTES, "Microsoft's answer");
  let body: TokenAnswer;
  try {
    body = JSON.parse(text) as TokenAnswer;
  } catch {
    throw new SyncError(`Microsoft answered ${res.status}`);
  }
  if (body.error && NEEDS_USER.has(body.error)) throw new SyncError(RECONNECT_MICROSOFT);
  if (!res.ok || !body.access_token) throw new SyncError(`Microsoft refused the request (${body.error ?? res.status})`);
  return body;
}

const expiry = (answer: TokenAnswer, now: number): number => now + (answer.expires_in ?? 3600) * 1000;

/**
 * The account's address from an ID token straight from Microsoft's token endpoint (TLS vouches for
 * it, OIDC §3.1.3.7): `email` when the account has one, else `preferred_username`.
 */
function emailOf(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const email = claims.email ?? claims.preferred_username;
    return typeof email === 'string' && email ? email.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/** Graph scopes come back as full URLs (https://graph.microsoft.com/Calendars.ReadWrite) or bare names. */
const granted = (scope: string | undefined, name: string): boolean =>
  (scope ?? '').split(' ').some((s) => s.toLowerCase().split('/').at(-1) === name.toLowerCase());

/**
 * Trades the code from the callback for tokens. Throws SyncError when Microsoft refuses, when there's
 * no refresh token, or when the user didn't grant Calendars.ReadWrite.
 */
export async function exchangeMicrosoftCode(
  client: MicrosoftClient,
  code: string,
  verifier: string,
  now = Date.now(),
): Promise<{ credentials: MicrosoftCredentials; email: string | null }> {
  const answer = await tokenRequest(client, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: client.redirectUri,
    scope: SCOPES.join(' '),
  });
  if (!granted(answer.scope, 'Calendars.ReadWrite'))
    throw new SyncError('Homa needs access to your calendars. Connect again and allow it.');
  if (!answer.refresh_token || !answer.access_token) throw new SyncError("Microsoft didn't send a refresh token");
  return {
    credentials: {
      accessToken: answer.access_token,
      refreshToken: answer.refresh_token,
      expiresAt: expiry(answer, now),
    },
    email: emailOf(answer.id_token),
  };
}

/** A new access token and (rotated) refresh token. Throws SyncError(RECONNECT_MICROSOFT) when the user must connect again. */
export async function refreshMicrosoftToken(
  client: MicrosoftClient,
  credentials: MicrosoftCredentials,
  now = Date.now(),
): Promise<MicrosoftCredentials> {
  const answer = await tokenRequest(client, {
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    scope: SCOPES.join(' '),
  });
  return {
    accessToken: answer.access_token ?? '',
    refreshToken: answer.refresh_token ?? credentials.refreshToken,
    expiresAt: expiry(answer, now),
  };
}
