// HTTP for CalDAV: one request with Basic auth, inside the same limits as feed fetches (URL rules
// and the private-network check on every hop, an overall timeout, a capped body). Redirects are
// followed by hand with the same method and body, since PROPFIND and REPORT must stay what they
// are; a redirect may not move from https to http, so the app password never travels in clear text.
import { assertPublicHost, type FetchPolicy, parseFeedUrl, readCapped, SyncError } from '../feed';

export type DavRequest = {
  method: 'PROPFIND' | 'REPORT' | 'GET' | 'PUT' | 'DELETE';
  depth?: '0' | '1';
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
};

export type DavAnswer = { status: number; headers: Headers; text: string; url: URL };

export type DavClient = { request(url: URL | string, req: DavRequest): Promise<DavAnswer> };

/** A client that signs every request as `username` with `password` (an app password). */
export function davClient(username: string, password: string, policy: FetchPolicy): DavClient {
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  return {
    async request(input: URL | string, req: DavRequest): Promise<DavAnswer> {
      const signal = AbortSignal.timeout(policy.timeoutMs);
      let url = parseFeedUrl(String(input));
      try {
        for (let hop = 0; ; hop++) {
          await assertPublicHost(url, policy.allowPrivate);
          const headers = new Headers({ authorization, 'user-agent': 'Homa calendar sync', ...req.headers });
          if (req.depth) headers.set('depth', req.depth);
          if (req.body !== undefined) headers.set('content-type', req.contentType ?? 'application/xml; charset=utf-8');
          const res = await fetch(url, { method: req.method, headers, body: req.body, redirect: 'manual', signal });
          const location = res.headers.get('location');
          if ([301, 302, 303, 307, 308].includes(res.status) && location) {
            await res.body?.cancel();
            if (hop >= policy.maxRedirects) throw new SyncError('The calendar server redirected too many times');
            const next = parseFeedUrl(new URL(location, url).href);
            if (url.protocol === 'https:' && next.protocol !== 'https:')
              throw new SyncError('The calendar server redirected to an insecure address');
            url = next;
            continue;
          }
          if (res.status === 401) {
            await res.body?.cancel();
            throw new SyncError("The calendar server didn't accept the user name or app password");
          }
          const text = await readCapped(res, policy.maxBytes, "The calendar server's answer");
          return { status: res.status, headers: res.headers, text, url };
        }
      } catch (err) {
        if (err instanceof SyncError) throw err;
        if (signal.aborted)
          throw new SyncError(`The calendar server did not answer within ${policy.timeoutMs / 1000} seconds`);
        // Network errors can name the URL; keep only the kind.
        throw new SyncError("Couldn't reach the calendar server");
      }
    },
  };
}
