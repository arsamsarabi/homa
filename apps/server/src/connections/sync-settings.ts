// What the connection services need from the config: the app key and the fetch policy.
import { type CredentialKey, DEFAULT_FETCH_POLICY, type FetchPolicy, parseCredentialKey } from '@homa/sync';
import type { Config } from '@/config';

export type SyncSettings = {
  /** Unset when HOMA_ENCRYPTION_KEY is: connected calendars are then unavailable. */
  key: CredentialKey | undefined;
  intervalMinutes: number;
  policy: FetchPolicy;
};

export const syncSettingsFrom = (config: Config): SyncSettings => ({
  key: config.HOMA_ENCRYPTION_KEY ? parseCredentialKey(config.HOMA_ENCRYPTION_KEY) : undefined,
  intervalMinutes: config.HOMA_SYNC_INTERVAL_MINUTES,
  policy: { ...DEFAULT_FETCH_POLICY, allowPrivate: config.HOMA_SYNC_ALLOW_PRIVATE_NETWORKS },
});

/** For the OpenAPI dump and tests that don't sync: no key, so connection routes answer 503. */
export const NO_SYNC: SyncSettings = { key: undefined, intervalMinutes: 30, policy: DEFAULT_FETCH_POLICY };
