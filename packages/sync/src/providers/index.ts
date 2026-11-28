// Provider adaptors: the iCalendar fields each server family adds on top of the standard, read on
// pull and written on push. Google and Microsoft have no travel-time field, so they have none yet.
import type { IcsExtension } from '@homa/core';
import { icloud } from './icloud';

export { icloud } from './icloud';

/** The adaptor for a CalDAV server, by its address: iCloud for *.icloud.com, else none. */
export function caldavProvider(serverUrl: string): IcsExtension | undefined {
  let host: string;
  try {
    host = new URL(serverUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return host === 'icloud.com' || host.endsWith('.icloud.com') ? icloud : undefined;
}
