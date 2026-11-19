import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ReadOnlyError, ValidationError } from '@homa/core';
import { EMPTY_CURSOR, type SyncCursor } from '../adapter';
import { DEFAULT_FETCH_POLICY, SyncError } from '../feed';
import { icsAdapter } from './ics-adapter';

const feed = (summary: string): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'X-WR-CALNAME:Holidays',
    'BEGIN:VEVENT',
    'UID:new-year@example.com',
    `SUMMARY:${summary}`,
    'DTSTART;VALUE=DATE:20270101',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

// A local feed server; loopback is only reachable because these tests allow private networks.
let body = feed('New Year');
let etag: string | null = '"v1"';
const seen: { path: string; ifNoneMatch: string | null }[] = [];
let server: ReturnType<typeof Bun.serve>;
const policy = { ...DEFAULT_FETCH_POLICY, allowPrivate: true, maxBytes: 10_000, timeoutMs: 2_000 };
const url = (path: string): string => `http://127.0.0.1:${server.port}${path}`;
const adapter = (path = '/feed.ics', p = policy): ReturnType<typeof icsAdapter> =>
  icsAdapter({ url: url(path) }, { floatingTz: 'UTC', policy: p });
const calendar = { remoteId: null, name: null, readOnly: true };

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      seen.push({ path, ifNoneMatch: req.headers.get('if-none-match') });
      if (path === '/loop') return Response.redirect('/loop', 302);
      if (path === '/moved') return Response.redirect('/feed.ics', 301);
      if (path === '/gone') return new Response('no', { status: 404 });
      if (path === '/huge') return new Response('x'.repeat(20_000));
      if (path === '/slow') {
        await Bun.sleep(500);
        return new Response(body);
      }
      if (etag && req.headers.get('if-none-match') === etag) return new Response(null, { status: 304 });
      return new Response(body, { headers: etag ? { etag } : {} });
    },
  });
});
afterAll(() => server.stop(true));

describe('ICS adapter', () => {
  let cursor: SyncCursor = EMPTY_CURSOR;

  test('a first pull parses the feed and keeps its validators and hash', async () => {
    const r = await adapter().pullChanges(calendar, EMPTY_CURSOR);
    if (r.kind !== 'snapshot') throw new Error(`expected a snapshot, got ${r.kind}`);
    expect(r.name).toBe('Holidays');
    expect(r.events.map((e) => [e.uid, e.summary])).toEqual([['new-year@example.com', 'New Year']]);
    expect(r.cursor.remoteEtag).toBe('"v1"');
    expect(r.cursor.contentHash).toMatch(/^[0-9a-f]{64}$/);
    cursor = r.cursor;
  });

  test('a 304 is unchanged and sends the ETag', async () => {
    seen.length = 0;
    expect(await adapter().pullChanges(calendar, cursor)).toEqual({ kind: 'unchanged', cursor });
    expect(seen).toEqual([{ path: '/feed.ics', ifNoneMatch: '"v1"' }]);
  });

  test('without validators, the same body is unchanged by its hash; a new one is a snapshot', async () => {
    etag = null;
    const same = await adapter().pullChanges(calendar, cursor);
    expect(same.kind).toBe('unchanged');
    body = feed('New Year!');
    const changed = await adapter().pullChanges(calendar, same.cursor);
    expect(changed.kind === 'snapshot' && changed.events[0]?.summary).toBe('New Year!');
    expect(changed.cursor.contentHash).not.toBe(cursor.contentHash);
  });

  test('follows a few redirects, but not forever', async () => {
    expect((await adapter('/moved').pullChanges(calendar, EMPTY_CURSOR)).kind).toBe('snapshot');
    await expect(adapter('/loop').pullChanges(calendar, EMPTY_CURSOR)).rejects.toThrow('redirected too many times');
  });

  test('errors, oversized bodies and timeouts are SyncErrors without the URL', async () => {
    const fail = async (path: string, p = policy): Promise<SyncError> => {
      const err = await adapter(path, p)
        .pullChanges(calendar, EMPTY_CURSOR)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SyncError);
      expect(String((err as Error).message)).not.toContain('127.0.0.1');
      return err as SyncError;
    };
    expect((await fail('/gone')).message).toBe("The feed's server answered 404");
    expect((await fail('/huge')).message).toContain('larger than');
    expect((await fail('/slow', { ...policy, timeoutMs: 100 })).message).toContain('did not answer');
  });

  test('loopback is refused unless the policy allows private networks', async () => {
    await expect(
      adapter('/feed.ics', { ...policy, allowPrivate: false }).pullChanges(calendar, EMPTY_CURSOR),
    ).rejects.toThrow('private or local');
  });

  test('a body that is not iCalendar is a ValidationError; pushes are refused', async () => {
    body = 'hello';
    await expect(adapter().pullChanges(calendar, EMPTY_CURSOR)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      adapter().pushChange({ kind: 'delete', calendarRemoteId: 'x', uid: 'y', etag: null }),
    ).rejects.toBeInstanceOf(ReadOnlyError);
  });
});
