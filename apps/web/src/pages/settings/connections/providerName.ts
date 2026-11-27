import type { TFunction } from 'i18next';
import type { Connection } from '@/schemas';

/** Where an account's calendars live, for "deleted on …": Google, Microsoft, or the CalDAV server. */
export const providerName = (provider: Connection['provider'] | undefined, t: TFunction): string =>
  provider === 'google' || provider === 'microsoft' ? t(`${provider}.provider`) : t('connections.providerServer');
