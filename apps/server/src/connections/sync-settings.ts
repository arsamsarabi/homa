// What the connection services need from the config: the app key, the fetch policy and the Google
// and Microsoft OAuth clients.
import {
  type CredentialKey,
  DEFAULT_FETCH_POLICY,
  type FetchPolicy,
  type GoogleClient,
  type MicrosoftClient,
  parseCredentialKey,
} from '@homa/sync';
import type { Config } from '@/config';

export type SyncSettings = {
  /** Unset when HOMA_ENCRYPTION_KEY is: connected calendars are then unavailable. */
  key: CredentialKey | undefined;
  intervalMinutes: number;
  policy: FetchPolicy;
  /** Unset when HOMA_GOOGLE_CLIENT_ID is: Google isn't offered. */
  google?: GoogleClient;
  /** Unset when HOMA_MICROSOFT_CLIENT_ID is: Microsoft isn't offered. */
  microsoft?: MicrosoftClient;
};

export const syncSettingsFrom = (config: Config): SyncSettings => ({
  key: config.HOMA_ENCRYPTION_KEY ? parseCredentialKey(config.HOMA_ENCRYPTION_KEY) : undefined,
  intervalMinutes: config.HOMA_SYNC_INTERVAL_MINUTES,
  policy: { ...DEFAULT_FETCH_POLICY, allowPrivate: config.HOMA_SYNC_ALLOW_PRIVATE_NETWORKS },
  ...(config.HOMA_GOOGLE_CLIENT_ID &&
    config.HOMA_GOOGLE_CLIENT_SECRET && {
      google: {
        clientId: config.HOMA_GOOGLE_CLIENT_ID,
        clientSecret: config.HOMA_GOOGLE_CLIENT_SECRET,
        redirectUri: new URL('/api/connections/google/callback', config.HOMA_URL).href,
      },
    }),
  ...(config.HOMA_MICROSOFT_CLIENT_ID &&
    config.HOMA_MICROSOFT_CLIENT_SECRET && {
      microsoft: {
        clientId: config.HOMA_MICROSOFT_CLIENT_ID,
        clientSecret: config.HOMA_MICROSOFT_CLIENT_SECRET,
        redirectUri: new URL('/api/connections/microsoft/callback', config.HOMA_URL).href,
      },
    }),
});

/** For the OpenAPI dump and tests that don't sync: no key, so connection routes answer 503. */
export const NO_SYNC: SyncSettings = { key: undefined, intervalMinutes: 30, policy: DEFAULT_FETCH_POLICY };
