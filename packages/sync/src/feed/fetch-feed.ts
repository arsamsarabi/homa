// Fetches a feed with a conditional GET, inside hard limits: an overall timeout, a size cap read
// from the stream (not trusted from Content-Length), at most a few redirects, each one re-checked
// against the URL rules in url-safety.ts.
import { SyncError } from './errors';
import { assertPublicHost, parseFeedUrl } from './url-safety';

export type FetchPolicy = {
  /** Allow loopback and private addresses (HOMA_SYNC_ALLOW_PRIVATE_NETWORKS). */
  allowPrivate: boolean;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
};

export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  allowPrivate: false,
  timeoutMs: 30_000,
  maxBytes: 5 * 1024 * 1024,
  maxRedirects: 5,
};

/** Validators from the last fetch, sent back as If-None-Match / If-Modified-Since. */
export type Validators = { etag: string | null; lastModified: string | null };

export type FeedResponse = { kind: 'not-modified' } | ({ kind: 'body'; text: string } & Validators);

/** Reads the body as text, stopping (SyncError) past `maxBytes` whatever Content-Length says. */
export async function readCapped(res: Response, maxBytes: number, what = 'The feed'): Promise<string> {
  const tooLarge = (): SyncError => new SyncError(`${what} is larger than ${maxBytes / 1024 / 1024} MB`);
  if (Number(res.headers.get('content-length')) > maxBytes) throw tooLarge();
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * GETs `input` (a feed URL as stored). Returns `not-modified` on a 304, otherwise the body and its
 * validators. Throws SyncError for refused URLs, network failures, non-2xx answers and the limits.
 */
export async function fetchFeed(
  input: string,
  since: Validators,
  policy: FetchPolicy = DEFAULT_FETCH_POLICY,
): Promise<FeedResponse> {
  const signal = AbortSignal.timeout(policy.timeoutMs);
  let url = parseFeedUrl(input);
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url, policy.allowPrivate);
      const headers = new Headers({ accept: 'text/calendar, */*;q=0.5', 'user-agent': 'Homa calendar sync' });
      if (since.etag) headers.set('if-none-match', since.etag);
      if (since.lastModified) headers.set('if-modified-since', since.lastModified);
      const res = await fetch(url, { headers, redirect: 'manual', signal });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && res.status !== 304 && location) {
        await res.body?.cancel();
        if (hop >= policy.maxRedirects) throw new SyncError('The feed redirected too many times');
        url = parseFeedUrl(new URL(location, url).href);
        continue;
      }
      if (res.status === 304) return { kind: 'not-modified' };
      if (!res.ok) {
        await res.body?.cancel();
        throw new SyncError(`The feed's server answered ${res.status}`);
      }
      const text = await readCapped(res, policy.maxBytes);
      return { kind: 'body', text, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
    }
  } catch (err) {
    if (err instanceof SyncError) throw err;
    if (signal.aborted) throw new SyncError(`The feed did not answer within ${policy.timeoutMs / 1000} seconds`);
    // Network errors can name the URL; keep only the kind.
    throw new SyncError("Couldn't reach the feed's server");
  }
}
