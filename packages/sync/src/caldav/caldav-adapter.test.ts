// The CalDAV adapter against a small fake server, for what Radicale doesn't do: no sync-collection
// (the ETag fallback), an expired sync-token, prefixed XML, a well-known redirect and 412s.
// Loopback is reachable only because the policy allows private networks.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { EMPTY_CURSOR } from '../adapter';
import { DEFAULT_FETCH_POLICY, PushConflict, PushError, SyncError } from '../feed';
import { caldavAdapter, resourceHref } from './caldav-adapter';

const ics = (uid: string, summary: string): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    'DTSTART:20270301T090000Z',
    'DTEND:20270301T100000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

let objects = new Map<string, { etag: string; body: string }>();
let syncCollection: 'unsupported' | 'expired' = 'unsupported';
const requests: string[] = [];
let server: ReturnType<typeof Bun.serve>;
const base = (): string => `http://127.0.0.1:${server.port}`;
const ms = (inner: string): Response =>
  new Response(`<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${inner}</D:multistatus>`, {
    status: 207,
  });
const ok = (props: string): string =>
  `<D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>`;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const body = await req.text();
      requests.push(`${req.method} ${path}`);
      if (req.headers.get('authorization') !== `Basic ${btoa('ada:pw')}`) return new Response(null, { status: 401 });
      if (path === '/') return new Response(null, { status: 404 });
      if (path === '/.well-known/caldav') return new Response(null, { status: 301, headers: { location: '/dav/' } });
      if (req.method === 'PROPFIND' && path === '/dav/')
        return ms(
          `<D:response><D:href>/dav/</D:href>${ok('<D:current-user-principal><D:href>/dav/p/ada/</D:href></D:current-user-principal>')}</D:response>`,
        );
      if (req.method === 'PROPFIND' && path === '/dav/p/ada/')
        return ms(
          `<D:response><D:href>/dav/p/ada/</D:href>${ok('<C:calendar-home-set><D:href>/dav/c/ada/</D:href></C:calendar-home-set>')}</D:response>`,
        );
      if (req.method === 'PROPFIND' && path === '/dav/c/ada/')
        return ms(
          `<D:response><D:href>/dav/c/ada/</D:href>${ok('<D:resourcetype><D:collection/></D:resourcetype>')}</D:response>` +
            `<D:response><D:href>/dav/c/ada/shared/</D:href>${ok('<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Shared</D:displayname><D:current-user-privilege-set><D:privilege><D:read/></D:privilege></D:current-user-privilege-set>')}</D:response>`,
        );
      if (req.method === 'REPORT' && body.includes('sync-collection')) {
        if (syncCollection === 'unsupported') return new Response('no', { status: 501 });
        if (!body.includes('<d:sync-token></d:sync-token>'))
          return new Response('<D:error xmlns:D="DAV:"><D:valid-sync-token/></D:error>', { status: 403 });
        return ms(
          `${[...objects].map(([h, o]) => `<D:response><D:href>${h}</D:href>${ok(`<D:getetag>${o.etag}</D:getetag>`)}</D:response>`).join('')}<D:sync-token>t2</D:sync-token>`,
        );
      }
      if (req.method === 'REPORT' && body.includes('calendar-query'))
        return ms(
          [...objects]
            .map(([h, o]) => `<D:response><D:href>${h}</D:href>${ok(`<D:getetag>${o.etag}</D:getetag>`)}</D:response>`)
            .join(''),
        );
      if (req.method === 'REPORT' && body.includes('calendar-multiget'))
        return ms(
          [...body.matchAll(/<d:href>([^<]+)<\/d:href>/g)]
            .map(([, h]) => {
              const o = objects.get(h ?? '');
              return o
                ? `<D:response><D:href>${h}</D:href>${ok(`<D:getetag>${o.etag}</D:getetag><C:calendar-data>${o.body}</C:calendar-data>`)}</D:response>`
                : `<D:response><D:href>${h}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`;
            })
            .join(''),
        );
      if (req.method === 'PUT') {
        const current = objects.get(path);
        const ifMatch = req.headers.get('if-match');
        if ((ifMatch && current?.etag !== ifMatch) || (req.headers.get('if-none-match') === '*' && current))
          return new Response(null, { status: 412 });
        if (path.includes('refuse')) return new Response(null, { status: 403 });
        const etag = `"${Bun.hash(body)}"`;
        objects.set(path, { etag, body });
        return new Response(null, { status: 201, headers: { etag } });
      }
      return new Response(null, { status: 405 });
    },
  });
});
afterAll(() => server.stop(true));

const adapter = (password = 'pw'): ReturnType<typeof caldavAdapter> =>
  caldavAdapter(
    { serverUrl: `${base()}/`, username: 'ada', password },
    { floatingTz: 'UTC', policy: { ...DEFAULT_FETCH_POLICY, allowPrivate: true, timeoutMs: 2_000 } },
  );

describe('caldavAdapter', () => {
  test('discovers through /.well-known/caldav and reads privileges', async () => {
    expect(await adapter().discover()).toBe(`${base()}/dav/c/ada/`);
    expect(await adapter().listCalendars()).toEqual([
      { remoteId: `${base()}/dav/c/ada/shared/`, name: 'Shared', color: null, readOnly: true },
    ]);
    await expect(adapter('wrong').discover()).rejects.toThrow("didn't accept the user name or app password");
  });

  test('without sync-collection, pulls by diffing ETags', async () => {
    objects = new Map([['/dav/c/ada/shared/a.ics', { etag: '"1"', body: ics('a', 'One') }]]);
    const calendar = { remoteId: `${base()}/dav/c/ada/shared/`, name: null, readOnly: true };
    const first = await adapter().pullChanges(calendar, EMPTY_CURSOR);
    expect(first).toMatchObject({ kind: 'delta', deleted: [], cursor: { syncToken: null } });
    if (first.kind !== 'delta') throw new Error('expected a delta');
    expect(first.changed.map((r) => [r.href, r.etag, r.events[0]?.summary])).toEqual([
      [`${base()}/dav/c/ada/shared/a.ics`, '"1"', 'One'],
    ]);

    // Same ETag: nothing downloaded. Gone from the listing: deleted.
    const known = new Map([[`${base()}/dav/c/ada/shared/a.ics`, '"1"']]);
    requests.length = 0;
    expect((await adapter().pullChanges(calendar, EMPTY_CURSOR, known)).kind).toBe('unchanged');
    expect(requests.some((r) => r.startsWith('REPORT') && r.includes('multiget'))).toBe(false);
    objects = new Map();
    expect(await adapter().pullChanges(calendar, EMPTY_CURSOR, known)).toMatchObject({
      kind: 'delta',
      changed: [],
      deleted: [`${base()}/dav/c/ada/shared/a.ics`],
    });
  });

  test('an expired sync-token starts over with a full listing', async () => {
    syncCollection = 'expired';
    objects = new Map([['/dav/c/ada/shared/b.ics', { etag: '"2"', body: ics('b', 'Two') }]]);
    const calendar = { remoteId: `${base()}/dav/c/ada/shared/`, name: null, readOnly: false };
    const known = new Map([[`${base()}/dav/c/ada/shared/old.ics`, '"0"']]);
    const result = await adapter().pullChanges(calendar, { ...EMPTY_CURSOR, syncToken: 't1' }, known);
    expect(result).toMatchObject({
      kind: 'delta',
      deleted: [`${base()}/dav/c/ada/shared/old.ics`],
      cursor: { syncToken: 't2' },
    });
  });

  test('pushes create with If-None-Match, update with If-Match; mismatches are conflicts', async () => {
    objects = new Map();
    const href = resourceHref(`${base()}/dav/c/ada/shared`, 'x y@homa');
    expect(href).toBe(`${base()}/dav/c/ada/shared/x_y_homa.ics`);
    const { etag } = await adapter().pushChange({ kind: 'put', href, ics: ics('x y@homa', 'New'), etag: null });
    expect(etag).toStartWith('"');
    await expect(
      adapter().pushChange({ kind: 'put', href, ics: ics('x', 'Again'), etag: null }),
    ).rejects.toBeInstanceOf(PushConflict);
    await expect(
      adapter().pushChange({ kind: 'put', href, ics: ics('x', 'Stale'), etag: '"old"' }),
    ).rejects.toBeInstanceOf(PushConflict);
    expect((await adapter().pushChange({ kind: 'put', href, ics: ics('x', 'Next'), etag })).etag).not.toBe(etag);
    expect((await adapter().fetchResource(href))?.events[0]?.summary).toBe('Next');
    expect(await adapter().fetchResource(`${base()}/dav/c/ada/shared/none.ics`)).toBeNull();

    const refused = adapter().pushChange({
      kind: 'put',
      href: `${base()}/dav/c/ada/shared/refuse.ics`,
      ics: ics('r', 'R'),
      etag: null,
    });
    await expect(refused).rejects.toBeInstanceOf(PushError);
    await expect(refused).rejects.toMatchObject({ retriable: false });
  });

  test('refuses private servers unless allowed', async () => {
    const strict = caldavAdapter({ serverUrl: base(), username: 'ada', password: 'pw' }, { floatingTz: 'UTC' });
    await expect(strict.discover()).rejects.toBeInstanceOf(SyncError);
  });
});
