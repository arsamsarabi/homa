// ICS subscriptions: one read-only calendar per feed URL. A pull is a conditional GET; a 304, or a
// body whose hash matches the last one, is "unchanged" and nothing is parsed. Otherwise the whole
// feed is parsed with the import parser (same hostile-input limits) and returned as a snapshot.
import { createHash } from 'node:crypto';
import { parseIcs, ReadOnlyError } from '@homa/core';
import type { PullResult, RemoteCalendar, SyncAdapter, SyncCursor } from '../adapter';
import { DEFAULT_FETCH_POLICY, type FetchPolicy, fetchFeed } from '../feed';

/** What an ICS connection stores, encrypted: the URL can carry a private token. */
export type IcsCredentials = { url: string };

export type IcsAdapterOptions = {
  /** IANA zone for floating times: the owner's home zone. */
  floatingTz: string;
  policy?: FetchPolicy;
};

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * @example
 * const result = await icsAdapter({ url }, { floatingTz: 'Europe/London' }).pullChanges(calendar, cursor);
 */
export function icsAdapter(credentials: IcsCredentials, options: IcsAdapterOptions): SyncAdapter {
  const policy = options.policy ?? DEFAULT_FETCH_POLICY;

  async function pull(since: SyncCursor): Promise<PullResult> {
    const res = await fetchFeed(
      credentials.url,
      { etag: since.remoteEtag, lastModified: since.remoteLastModified },
      policy,
    );
    if (res.kind === 'not-modified') return { kind: 'unchanged', cursor: since };
    const cursor: SyncCursor = {
      remoteEtag: res.etag,
      remoteLastModified: res.lastModified,
      contentHash: sha256(res.text),
      syncToken: null,
    };
    if (cursor.contentHash === since.contentHash) return { kind: 'unchanged', cursor };
    const parsed = parseIcs(res.text, { floatingTz: options.floatingTz });
    return { kind: 'snapshot', ...parsed, cursor };
  }

  return {
    async listCalendars(): Promise<RemoteCalendar[]> {
      const res = await pull({ remoteEtag: null, remoteLastModified: null, contentHash: null, syncToken: null });
      return [{ remoteId: null, name: res.kind === 'snapshot' ? res.name : null, readOnly: true }];
    },
    pullChanges: (_calendar: RemoteCalendar, since: SyncCursor): Promise<PullResult> => pull(since),
    pushChange: (): Promise<never> => Promise.reject(new ReadOnlyError('ICS subscriptions are read-only')),
    fetchResource: (): Promise<never> => Promise.reject(new ReadOnlyError('ICS subscriptions have no resources')),
    newHref: (): never => {
      throw new ReadOnlyError('ICS subscriptions are read-only');
    },
  };
}
