// The Google adapter against the fake Google in ../testing: paging, syncToken and 410, series with
// changed and cancelled occurrences, all-day events, deletes, pushes with If-Match and 412,
// token refresh and invalid_grant.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { serializeEvent } from '@homa/core';
import { EMPTY_CURSOR, type PullResult, type RemoteResource, type SyncCursor } from '../adapter';
import { PushConflict, SyncError } from '../feed';
import { type FakeGoogle, fakeGoogle } from '../testing';
import { googleAdapter } from './google-adapter';
import { googleEventId } from './mapping';
import { type GoogleCredentials, RECONNECT_GOOGLE } from './oauth';

const g: FakeGoogle = fakeGoogle();
afterAll(() => g.stop());

const NOW = Date.parse('2027-01-01T00:00:00Z');
let saved: GoogleCredentials[] = [];
const adapter = (credentials: Partial<GoogleCredentials> = {}): ReturnType<typeof googleAdapter> =>
  googleAdapter(
    { accessToken: g.state.accessToken, refreshToken: 'rt-0', expiresAt: NOW + 3_600_000, ...credentials },
    {
      floatingTz: 'UTC',
      client: { clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://x/cb', endpoints: g.endpoints },
      onCredentials: async (c) => {
        saved.push(c);
      },
      now: () => NOW,
    },
  );
const cal = { remoteId: 'ada@example.com', name: 'Ada', readOnly: false };
const href = (id: string): string => `${g.endpoints.api}/calendars/ada%40example.com/events/${id}`;

const standup = {
  id: 'standup',
  iCalUID: 'standup@google.com',
  summary: 'Stand-up',
  start: { dateTime: '2027-03-01T09:00:00Z', timeZone: 'Europe/London' },
  end: { dateTime: '2027-03-01T09:15:00Z', timeZone: 'Europe/London' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
};

beforeEach(() => {
  g.events.clear();
  g.requests.length = 0;
  g.state.expireSyncTokens = false;
  g.state.revoked = false;
  saved = [];
});

const deltaOf = (r: PullResult): Extract<PullResult, { kind: 'delta' }> => {
  if (r.kind !== 'delta') throw new Error(`expected a delta, got ${r.kind}`);
  return r;
};
const byHref = (rs: RemoteResource[]): Map<string, RemoteResource> => new Map(rs.map((r) => [r.href, r]));

test('lists calendars with their color, and reader calendars as read-only', async () => {
  g.calendars.splice(
    0,
    Infinity,
    { id: 'ada@example.com', summary: 'Ada', accessRole: 'owner', backgroundColor: '#9FC6E7' },
    { id: 'holidays@group.v.calendar.google.com', summary: 'Holidays', accessRole: 'reader' },
    { id: 'boss@example.com', summary: 'Boss', accessRole: 'freeBusyReader' },
  );
  expect(await adapter().listCalendars()).toEqual([
    { remoteId: 'ada@example.com', name: 'Ada', color: '#9fc6e7', readOnly: false },
    { remoteId: 'holidays@group.v.calendar.google.com', name: 'Holidays', color: null, readOnly: true },
    { remoteId: 'boss@example.com', name: 'Boss', color: null, readOnly: true },
  ]);
});

describe('pull', () => {
  test('a full listing across pages, then deltas with the syncToken', async () => {
    g.put('ada@example.com', standup);
    g.put('ada@example.com', {
      id: 'standup_20270308T090000Z',
      iCalUID: 'standup@google.com',
      recurringEventId: 'standup',
      originalStartTime: { dateTime: '2027-03-08T09:00:00Z', timeZone: 'Europe/London' },
      summary: 'Stand-up (late)',
      start: { dateTime: '2027-03-08T11:00:00Z', timeZone: 'Europe/London' },
      end: { dateTime: '2027-03-08T11:15:00Z', timeZone: 'Europe/London' },
    });
    g.put('ada@example.com', {
      id: 'standup_20270315T090000Z',
      iCalUID: 'standup@google.com',
      status: 'cancelled',
      recurringEventId: 'standup',
      originalStartTime: { dateTime: '2027-03-15T09:00:00Z', timeZone: 'Europe/London' },
    });
    g.put('ada@example.com', {
      id: 'trip',
      summary: 'Trip',
      start: { date: '2027-04-01' },
      end: { date: '2027-04-04' },
    });
    g.put('ada@example.com', { id: 'gone', summary: 'Old', status: 'cancelled' });

    const first = deltaOf(await adapter().pullChanges(cal, EMPTY_CURSOR));
    // Four listed events (not the deleted one) at two per page.
    expect(g.requests.filter((r) => r.includes('/events?')).length).toBe(2);
    expect(first.cursor.syncToken).toBe('s5');
    const got = byHref(first.changed);
    expect([...got.keys()]).toEqual([href('standup'), href('trip')]);
    const series = got.get(href('standup'));
    expect(series?.etag).toBe('"1"');
    expect(series?.events[0]).toMatchObject({
      uid: 'standup@google.com',
      tz: 'Europe/London',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
    });
    expect(series?.events[0]?.exdates).toEqual([new Date('2027-03-15T09:00:00Z')]);
    expect(series?.events[0]?.overrides.map((o) => o.summary)).toEqual(['Stand-up (late)']);
    expect(got.get(href('trip'))?.events[0]).toMatchObject({ allDay: true, uid: 'trip@google.com' });

    // Nothing changed.
    const cursor: SyncCursor = first.cursor;
    const known = new Map(first.changed.map((r) => [r.href, r.etag]));
    expect((await adapter().pullChanges(cal, cursor, known)).kind).toBe('unchanged');

    // An occurrence moves: the series comes back whole. The trip is deleted.
    g.put('ada@example.com', {
      id: 'standup_20270322T090000Z',
      iCalUID: 'standup@google.com',
      recurringEventId: 'standup',
      originalStartTime: { dateTime: '2027-03-22T09:00:00Z', timeZone: 'Europe/London' },
      summary: 'Stand-up',
      start: { dateTime: '2027-03-22T10:00:00Z', timeZone: 'Europe/London' },
      end: { dateTime: '2027-03-22T10:15:00Z', timeZone: 'Europe/London' },
    });
    g.cancel('ada@example.com', 'trip');
    const next = deltaOf(await adapter().pullChanges(cal, cursor, known));
    expect(next.deleted).toEqual([href('trip')]);
    expect(next.changed.map((r) => r.href)).toEqual([href('standup')]);
    expect(next.changed[0]?.events[0]?.overrides.length).toBe(2);
    expect(next.changed[0]?.events[0]?.exdates.length).toBe(1);
    expect(next.cursor.syncToken).toBe('s7');
  });

  test('a master coming back with the ETag Homa holds (its own upload) is not fetched again', async () => {
    const e = g.put('ada@example.com', { ...standup, id: 'mine' });
    const known = new Map([[href('mine'), e.etag ?? null]]);
    expect((await adapter().pullChanges(cal, { ...EMPTY_CURSOR, syncToken: 's0' }, known)).kind).toBe('unchanged');
    expect(g.requests.some((r) => r.includes('iCalUID'))).toBe(false);
  });

  test('an expired syncToken (410) lists everything again, and what is no longer there is deleted', async () => {
    g.put('ada@example.com', standup);
    g.state.expireSyncTokens = true;
    const known = new Map([
      [href('standup'), '"old"'],
      [href('deleted-meanwhile'), '"9"'],
    ]);
    const r = deltaOf(await adapter().pullChanges(cal, { ...EMPTY_CURSOR, syncToken: 's3' }, known));
    expect(g.requests[0]).toContain('syncToken=s3');
    expect(r.changed.map((x) => x.href)).toEqual([href('standup')]);
    expect(r.deleted).toEqual([href('deleted-meanwhile')]);
    expect(r.cursor.syncToken).toMatch(/^s\d+$/);
  });
});

describe('push', () => {
  const ics = (summary: string, overrides = false): string =>
    serializeEvent(
      {
        uid: 'homa-1',
        summary,
        description: 'Notes',
        location: null,
        startAt: new Date('2027-03-01T18:00:00Z'),
        endAt: new Date('2027-03-01T19:00:00Z'),
        allDay: false,
        tz: 'Europe/London',
        rrule: 'FREQ=WEEKLY',
        exdates: [],
        rdates: [],
      },
      overrides
        ? [
            {
              recurrenceId: new Date('2027-03-08T18:00:00Z'),
              summary: 'Gym (late)',
              description: null,
              location: null,
              startAt: new Date('2027-03-08T19:00:00Z'),
              endAt: new Date('2027-03-08T20:00:00Z'),
            },
          ]
        : [],
    );
  const id = googleEventId('homa-1');

  test('creates with an id from the UID, patches with If-Match, and a stale ETag is a conflict', async () => {
    const a = adapter();
    const target = a.newHref('ada@example.com', 'homa-1');
    expect(target).toBe(href(id));
    const created = await a.pushChange({ kind: 'put', href: target, ics: ics('Gym'), etag: null });
    expect(g.get('ada@example.com', id)).toMatchObject({
      iCalUID: `${id}@google.com`,
      extendedProperties: { private: { homaUid: 'homa-1' } },
      summary: 'Gym',
      recurrence: ['RRULE:FREQ=WEEKLY'],
    });
    // A retried create (the first one got through) patches instead of failing.
    const again = await a.pushChange({ kind: 'put', href: target, ics: ics('Gym'), etag: null });
    expect(again.etag).not.toBe(created.etag);

    const patched = await a.pushChange({ kind: 'put', href: target, ics: ics('Gym 2', true), etag: again.etag });
    expect(g.get('ada@example.com', id)?.summary).toBe('Gym 2');
    expect(g.get('ada@example.com', `${id}_20270308T180000Z`)).toMatchObject({
      summary: 'Gym (late)',
      recurringEventId: id,
      start: { dateTime: '2027-03-08T19:00:00.000Z', timeZone: 'Europe/London' },
    });
    expect(patched.etag).toBe(g.get('ada@example.com', id)?.etag ?? 'missing');

    await expect(
      a.pushChange({ kind: 'put', href: target, ics: ics('Gym 3'), etag: '"stale"' }),
    ).rejects.toBeInstanceOf(PushConflict);
    await expect(a.pushChange({ kind: 'delete', href: target, etag: '"stale"' })).rejects.toBeInstanceOf(PushConflict);
    await a.pushChange({ kind: 'delete', href: target, etag: patched.etag ?? '' });
    expect(g.get('ada@example.com', id)?.status).toBe('cancelled');
    // Already gone counts as done.
    expect(await a.pushChange({ kind: 'delete', href: target, etag: patched.etag ?? '' })).toEqual({ etag: null });
    // A deleted event has no resource any more.
    expect(await a.fetchResource(target)).toBeNull();
  });

  test('fetchResource returns the series as Google has it', async () => {
    g.put('ada@example.com', standup);
    const r = await adapter().fetchResource(href('standup'));
    expect(r?.etag).toBe(g.get('ada@example.com', 'standup')?.etag ?? 'missing');
    expect(r?.events[0]?.summary).toBe('Stand-up');
  });
});

describe('tokens', () => {
  test('an expired access token is refreshed first and the new one is stored', async () => {
    g.calendars.splice(0, Infinity, { id: 'ada@example.com', summary: 'Ada', accessRole: 'owner' });
    await adapter({ accessToken: 'old', expiresAt: NOW - 1 }).listCalendars();
    expect(g.tokenRequests.at(-1)?.get('grant_type')).toBe('refresh_token');
    expect(g.tokenRequests.at(-1)?.get('client_secret')).toBe('secret');
    expect(saved).toEqual([{ accessToken: g.state.accessToken, refreshToken: 'rt-0', expiresAt: NOW + 3_599_000 }]);
  });

  test('a 401 refreshes once and retries', async () => {
    await adapter({ accessToken: 'revoked-by-google' }).listCalendars();
    expect(saved.length).toBe(1);
    expect(g.requests.filter((r) => r.includes('calendarList')).length).toBe(2);
  });

  test('invalid_grant asks the user to connect again', async () => {
    g.state.revoked = true;
    const p = adapter({ accessToken: 'old', expiresAt: NOW - 1 }).listCalendars();
    await expect(p).rejects.toBeInstanceOf(SyncError);
    await expect(p).rejects.toThrow(RECONNECT_GOOGLE);
    expect(saved).toEqual([]);
  });
});
