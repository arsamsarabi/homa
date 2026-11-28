// CalDAV (RFC 4791) with an app password: iCloud, Fastmail, Nextcloud, Radicale and the like.
//
// Discovery: the server URL (else its /.well-known/caldav) → current-user-principal →
// calendar-home-set → the calendars in it (PROPFIND, depth 1), keeping those that hold events.
// Pull: sync-collection (RFC 6578) with the stored sync-token lists changed and deleted members;
// an invalid token (403/409 valid-sync-token) starts again from an empty token, and a server
// without sync-collection falls back to diffing ETags from a calendar-query. Changed resources are
// downloaded with calendar-multiget and parsed with the .ics import parser and its limits.
// Push: PUT with If-Match (or If-None-Match: * to create) and DELETE with If-Match; a 412 is a
// PushConflict, and the caller lets the remote win.
import { type IcsExtension, parseIcs, ValidationError } from '@homa/core';
import type { ChangeOp, PullResult, RemoteCalendar, RemoteResource, SyncAdapter, SyncCursor } from '../adapter';
import { CalendarGoneError, DEFAULT_FETCH_POLICY, type FetchPolicy, PushConflict, PushError, SyncError } from '../feed';
import { type DavAnswer, davClient } from './dav-client';
import {
  APPLE,
  CALDAV,
  DAV,
  type DavResponse,
  etagQueryBody,
  has,
  hasPrecondition,
  hrefsIn,
  multigetBody,
  parseMultistatus,
  prop,
  propfindBody,
  syncCollectionBody,
  text,
} from './xml';

/** What a CalDAV connection stores, encrypted. `homeUrl` is found once, when the connection is added. */
export type CaldavCredentials = { serverUrl: string; username: string; password: string; homeUrl?: string };

export type CaldavAdapterOptions = {
  /** IANA zone for floating times: the owner's home zone. */
  floatingTz: string;
  policy?: FetchPolicy;
  /** The server family's own fields (caldavProvider picks it from the server URL). */
  provider?: IcsExtension;
};

/** Hrefs per calendar-multiget request. */
const MULTIGET_BATCH = 50;

export type CaldavAdapter = SyncAdapter & {
  /** Finds the calendar home (the URL that lists the user's calendars). Throws SyncError with the reason. */
  discover(): Promise<string>;
};

const isMultistatus = (a: DavAnswer): boolean => a.status === 207;

const unexpected = (a: DavAnswer): SyncError => new SyncError(`The calendar server answered ${a.status}`);
/** Throws CalendarGoneError if the server no longer has the calendar collection (404 or 410). */
const assertCollection = (a: DavAnswer): void => {
  if (a.status === 404 || a.status === 410)
    throw new CalendarGoneError('The calendar server no longer has this calendar, or this account lost access to it');
};

/** `#rrggbb` from an Apple calendar-color (`#rrggbbaa` or `#rgb`), else null. */
function colorOf(value: string): string | null {
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
  if (m) return `#${m[1]?.toLowerCase()}`;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  return short
    ? `#${short
        .slice(1)
        .map((c) => c.repeat(2))
        .join('')
        .toLowerCase()}`
    : null;
}

/**
 * @example
 * const adapter = caldavAdapter({ serverUrl: 'https://caldav.fastmail.com', username, password }, { floatingTz });
 * const calendars = await adapter.listCalendars();
 */
export function caldavAdapter(credentials: CaldavCredentials, options: CaldavAdapterOptions): CaldavAdapter {
  const policy = options.policy ?? DEFAULT_FETCH_POLICY;
  const dav = davClient(credentials.username, credentials.password, policy);
  let home = credentials.homeUrl;

  /** Hrefs in an answer, resolved against the URL that answered. */
  const resolve = (href: string, base: URL): string => new URL(href, base).href;

  async function propfind(
    url: string,
    depth: '0' | '1',
    props: string,
  ): Promise<{ answer: DavAnswer; responses: DavResponse[] }> {
    const answer = await dav.request(url, { method: 'PROPFIND', depth, body: propfindBody(props) });
    if (!isMultistatus(answer)) throw unexpected(answer);
    return { answer, responses: parseMultistatus(answer.text).responses };
  }

  async function principalAt(url: string): Promise<string | null> {
    const answer = await dav.request(url, {
      method: 'PROPFIND',
      depth: '0',
      body: propfindBody('<d:current-user-principal/>'),
    });
    if (!isMultistatus(answer)) return null;
    for (const r of parseMultistatus(answer.text).responses) {
      const [href] = hrefsIn(prop(r, DAV, 'current-user-principal'));
      if (href) return resolve(href, answer.url);
    }
    return null;
  }

  async function discover(): Promise<string> {
    const start = new URL(credentials.serverUrl);
    const principal =
      (await principalAt(start.href)) ?? (await principalAt(new URL('/.well-known/caldav', start).href));
    if (!principal) throw new SyncError("Couldn't find a CalDAV account at that address");
    const { answer, responses } = await propfind(principal, '0', '<c:calendar-home-set/>');
    for (const r of responses) {
      const [href] = hrefsIn(prop(r, CALDAV, 'calendar-home-set'));
      if (href) {
        home = resolve(href, answer.url);
        return home;
      }
    }
    throw new SyncError("The CalDAV account doesn't say where its calendars are");
  }

  async function listCalendars(): Promise<RemoteCalendar[]> {
    const url = home ?? (await discover());
    const { answer, responses } = await propfind(
      url,
      '1',
      '<d:resourcetype/><d:displayname/><d:current-user-privilege-set/><c:supported-calendar-component-set/><a:calendar-color/>',
    );
    const out: RemoteCalendar[] = [];
    for (const r of responses) {
      if (!has(prop(r, DAV, 'resourcetype'), CALDAV, 'calendar')) continue;
      // Without the property a calendar takes every component; with it, it must list VEVENT.
      const comps = prop(r, CALDAV, 'supported-calendar-component-set');
      if (
        comps &&
        !Array.from(comps.getElementsByTagNameNS(CALDAV, 'comp')).some(
          (c) => c.getAttribute('name')?.toUpperCase() === 'VEVENT',
        )
      )
        continue;
      const privileges = prop(r, DAV, 'current-user-privilege-set');
      const writable = !privileges || ['all', 'write', 'write-content', 'bind'].some((p) => has(privileges, DAV, p));
      out.push({
        remoteId: resolve(r.href, answer.url),
        name: text(prop(r, DAV, 'displayname')) || null,
        color: colorOf(text(prop(r, APPLE, 'calendar-color'))),
        readOnly: !writable,
      });
    }
    return out;
  }

  /** Downloads and parses resources, in batches. Unreadable ones are skipped with a warning. */
  async function multiget(
    calendarUrl: string,
    hrefs: readonly string[],
  ): Promise<{ resources: RemoteResource[]; missing: string[]; skipped: number; warnings: string[] }> {
    const resources: RemoteResource[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];
    let skipped = 0;
    for (let i = 0; i < hrefs.length; i += MULTIGET_BATCH) {
      const batch = hrefs.slice(i, i + MULTIGET_BATCH);
      const answer = await dav.request(calendarUrl, {
        method: 'REPORT',
        depth: '1',
        body: multigetBody(batch.map((h) => new URL(h).pathname)),
      });
      if (!isMultistatus(answer)) throw unexpected(answer);
      for (const r of parseMultistatus(answer.text).responses) {
        const href = resolve(r.href, answer.url);
        const data = prop(r, CALDAV, 'calendar-data');
        if (!data) {
          if (r.status === 404) missing.push(href);
          continue;
        }
        try {
          const parsed = parseIcs(text(data), { floatingTz: options.floatingTz, extension: options.provider });
          skipped += parsed.skipped;
          warnings.push(...parsed.warnings);
          resources.push({ href, etag: text(prop(r, DAV, 'getetag')) || null, events: parsed.events });
        } catch (err) {
          if (!(err instanceof ValidationError)) throw err;
          skipped++;
          warnings.push(`A calendar object was skipped: ${err.message}`);
        }
      }
    }
    return { resources, missing, skipped, warnings };
  }

  /** href → ETag of every event in the calendar (the fallback when sync-collection isn't there). */
  async function listEtags(calendarUrl: string): Promise<Map<string, string | null>> {
    const answer = await dav.request(calendarUrl, { method: 'REPORT', depth: '1', body: etagQueryBody() });
    assertCollection(answer);
    if (!isMultistatus(answer)) throw unexpected(answer);
    const out = new Map<string, string | null>();
    for (const r of parseMultistatus(answer.text).responses) {
      const href = resolve(r.href, answer.url);
      if (href !== calendarUrl && r.status !== 404) out.set(href, text(prop(r, DAV, 'getetag')) || null);
    }
    return out;
  }

  type Listing = { etags: Map<string, string | null>; deleted: string[]; full: boolean; token: string | null };

  /** What changed since `token` (sync-collection), or null if the server doesn't support it. */
  async function syncCollection(calendarUrl: string, token: string | null): Promise<Listing | null> {
    const answer = await dav.request(calendarUrl, { method: 'REPORT', depth: '0', body: syncCollectionBody(token) });
    assertCollection(answer);
    if (!isMultistatus(answer)) {
      // An expired or unknown token: start over with a full listing.
      const invalidToken = [403, 409].includes(answer.status) || hasPrecondition(answer.text, DAV, 'valid-sync-token');
      if (token && invalidToken) return syncCollection(calendarUrl, null);
      if ([400, 403, 405, 409, 415, 501].includes(answer.status)) return null;
      throw unexpected(answer);
    }
    const ms = parseMultistatus(answer.text);
    const etags = new Map<string, string | null>();
    const deleted: string[] = [];
    for (const r of ms.responses) {
      const href = resolve(r.href, answer.url);
      if (href === calendarUrl) continue;
      if (r.status === 404) deleted.push(href);
      else etags.set(href, text(prop(r, DAV, 'getetag')) || null);
    }
    return { etags, deleted, full: !token, token: ms.syncToken };
  }

  async function pullChanges(
    calendar: RemoteCalendar,
    since: SyncCursor,
    known: ReadonlyMap<string, string | null> = new Map(),
  ): Promise<PullResult> {
    const url = calendar.remoteId;
    if (!url) throw new SyncError('This calendar has no address on the server');
    const listing: Listing = (await syncCollection(url, since.syncToken)) ?? {
      etags: await listEtags(url),
      deleted: [],
      full: true,
      token: null,
    };
    // A full listing names every member, so what Homa holds and the server doesn't is gone.
    if (listing.full) for (const href of known.keys()) if (!listing.etags.has(href)) listing.deleted.push(href);
    const changed = [...listing.etags].filter(([href, etag]) => !etag || known.get(href) !== etag).map(([h]) => h);
    const got = await multiget(url, changed);
    const cursor: SyncCursor = { ...since, syncToken: listing.token };
    if (!got.resources.length && !listing.deleted.length && !got.missing.length) return { kind: 'unchanged', cursor };
    return {
      kind: 'delta',
      changed: got.resources,
      deleted: [...new Set([...listing.deleted, ...got.missing])],
      skipped: got.skipped,
      warnings: got.warnings.slice(0, 50),
      cursor,
    };
  }

  async function pushChange(op: ChangeOp): Promise<{ etag: string | null }> {
    const headers: Record<string, string> = op.etag ? { 'if-match': op.etag } : { 'if-none-match': '*' };
    const answer =
      op.kind === 'put'
        ? await dav.request(op.href, {
            method: 'PUT',
            body: op.ics,
            contentType: 'text/calendar; charset=utf-8',
            headers,
          })
        : await dav.request(op.href, { method: 'DELETE', headers });
    if (answer.status >= 200 && answer.status < 300) return { etag: answer.headers.get('etag') };
    if (op.kind === 'delete' && (answer.status === 404 || answer.status === 410)) return { etag: null }; // already gone
    if (answer.status === 412 || (op.etag && answer.status === 404)) throw new PushConflict();
    const retriable = answer.status >= 500 || answer.status === 429 || answer.status === 408;
    throw new PushError(`The calendar server refused the change (${answer.status})`, retriable);
  }

  async function fetchResource(href: string): Promise<RemoteResource | null> {
    const calendarUrl = new URL('.', href).href;
    const got = await multiget(calendarUrl, [href]);
    return got.resources.find((r) => r.href === href) ?? null;
  }

  return {
    discover,
    listCalendars,
    pullChanges,
    pushChange,
    fetchResource,
    newHref: resourceHref,
    extension: options.provider,
  };
}

/** The href for a new event in a calendar: the UID made safe for a path segment. */
export const resourceHref = (calendarUrl: string, uid: string): string =>
  new URL(
    `${uid.replace(/[^\w.-]/g, '_').slice(0, 200)}.ics`,
    calendarUrl.endsWith('/') ? calendarUrl : `${calendarUrl}/`,
  ).href;
