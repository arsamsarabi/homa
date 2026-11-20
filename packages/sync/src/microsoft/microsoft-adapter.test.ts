// The Microsoft adapter against the fake Graph in ../testing: calendars, listings across pages,
// changeKeys, series with exceptions and cancelled occurrences, deletes, a calendar that's gone,
// creates (transactionId, Homa's UID property), patches, override and EXDATE pushes, conflicts,
// throttling with Retry-After, token refresh with rotation and invalid_grant.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { serializeEvent } from '@homa/core';
import { EMPTY_CURSOR, type PullResult, type RemoteResource } from '../adapter';
import { CalendarGoneError, PushConflict, PushError, SyncError } from '../feed';
import { type FakeMicrosoft, fakeMicrosoft } from '../testing';
import { type GraphEvent, HOMA_UID_PROPERTY } from './mapping';
import { microsoftAdapter } from './microsoft-adapter';
import { type MicrosoftCredentials, RECONNECT_MICROSOFT } from './oauth';

const g: FakeMicrosoft = fakeMicrosoft();
afterAll(() => g.stop());

const NOW = Date.parse('2027-01-01T00:00:00Z');
let saved: MicrosoftCredentials[] = [];
const adapter = (credentials: Partial<MicrosoftCredentials> = {}): ReturnType<typeof microsoftAdapter> =>
  microsoftAdapter(
    {
      accessToken: g.state.accessToken,
      refreshToken: g.state.refreshToken,
      expiresAt: NOW + 3_600_000,
      ...credentials,
    },
    {
      floatingTz: 'UTC',
      client: { clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://x/cb', endpoints: g.endpoints },
      onCredentials: async (c) => {
        saved.push(c);
      },
      now: () => NOW,
    },
  );
const cal = { remoteId: 'cal-1', name: 'Calendar', readOnly: false };
const href = (id: string): string => `${g.endpoints.api}/me/calendars/cal-1/events/${encodeURIComponent(id)}`;

const standup: GraphEvent = {
  id: 'standup',
  subject: 'Stand-up',
  start: { dateTime: '2027-03-01T09:00:00', timeZone: 'GMT Standard Time' },
  end: { dateTime: '2027-03-01T09:15:00', timeZone: 'GMT Standard Time' },
  recurrence: {
    pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'], firstDayOfWeek: 'sunday' },
    range: { type: 'numbered', startDate: '2027-03-01', numberOfOccurrences: 6 },
  },
};

beforeEach(() => {
  g.events.clear();
  g.requests.length = 0;
  g.state.revoked = false;
  g.state.throttle = 0;
  g.state.missingCalendars.clear();
  g.calendars.splice(0, Infinity, { id: 'cal-1', name: 'Calendar', canEdit: true, hexColor: '#E3008C' });
  saved = [];
});

const deltaOf = (r: PullResult): Extract<PullResult, { kind: 'delta' }> => {
  if (r.kind !== 'delta') throw new Error(`expected a delta, got ${r.kind}`);
  return r;
};
const byHref = (rs: RemoteResource[]): Map<string, RemoteResource> => new Map(rs.map((r) => [r.href, r]));

test('lists calendars across pages, with their color, and shared read-only ones', async () => {
  g.calendars.push({ id: 'cal-2', name: 'Birthdays', canEdit: false }, { id: 'cal-3', name: 'Team', canEdit: true });
  expect(await adapter().listCalendars()).toEqual([
    { remoteId: 'cal-1', name: 'Calendar', color: '#e3008c', readOnly: false },
    { remoteId: 'cal-2', name: 'Birthdays', color: null, readOnly: true },
    { remoteId: 'cal-3', name: 'Team', color: null, readOnly: false },
  ]);
  expect(g.requests.filter((r) => r.startsWith('GET /v1.0/me/calendars')).length).toBe(2);
});

describe('pull', () => {
  test('a full listing across pages, a series with an exception and a cancellation, then only what changed', async () => {
    g.put('cal-1', standup);
    g.changeOccurrence('standup', '2027-03-08T09:00:00Z', {
      subject: 'Stand-up (late)',
      start: { dateTime: '2027-03-08T11:00:00', timeZone: 'UTC' },
      end: { dateTime: '2027-03-08T11:15:00', timeZone: 'UTC' },
    });
    g.cancelOccurrence('standup', '2027-03-15T09:00:00Z');
    g.put('cal-1', {
      id: 'trip',
      subject: 'Trip',
      isAllDay: true,
      start: { dateTime: '2027-04-01T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2027-04-04T00:00:00', timeZone: 'UTC' },
    });
    g.put('cal-1', {
      id: 'lunch',
      subject: 'Lunch',
      start: { dateTime: '2027-03-02T12:00:00', timeZone: 'Pacific Standard Time' },
      end: { dateTime: '2027-03-02T13:00:00', timeZone: 'Pacific Standard Time' },
    });

    const first = deltaOf(await adapter().pullChanges(cal, EMPTY_CURSOR));
    // Three events at two per page; the series master fetched again with its occurrences.
    expect(g.requests.filter((r) => r.startsWith('GET /v1.0/me/calendars/cal-1/events?')).length).toBe(2);
    expect(g.requests.filter((r) => r.startsWith('GET /v1.0/me/calendars/cal-1/events/standup?')).length).toBe(1);
    expect(first.cursor.syncToken).toBeNull();
    const got = byHref(first.changed);
    expect([...got.keys()].sort()).toEqual([href('lunch'), href('standup'), href('trip')]);
    const series = got.get(href('standup'));
    expect(series?.etag).toBe(g.get('standup')?.changeKey ?? 'missing');
    expect(series?.events[0]).toMatchObject({ tz: 'Europe/London', rrule: 'FREQ=WEEKLY;COUNT=6;BYDAY=MO;WKST=SU' });
    expect(series?.events[0]?.exdates).toEqual([new Date('2027-03-15T09:00:00Z')]);
    expect(series?.events[0]?.overrides.map((o) => o.summary)).toEqual(['Stand-up (late)']);
    expect(got.get(href('trip'))?.events[0]).toMatchObject({ allDay: true });
    expect(got.get(href('lunch'))?.events[0]).toMatchObject({
      tz: 'America/Los_Angeles',
      start: new Date('2027-03-02T20:00:00Z'),
    });

    // Nothing changed: no event is read.
    const known = new Map(first.changed.map((r) => [r.href, r.etag]));
    g.requests.length = 0;
    expect((await adapter().pullChanges(cal, first.cursor, known)).kind).toBe('unchanged');
    expect(g.requests.some((r) => r.includes('/events/'))).toBe(false);

    // An occurrence is cancelled in Outlook (the master's changeKey changes) and the trip deleted.
    g.cancelOccurrence('standup', '2027-03-22T09:00:00Z');
    g.events.delete('trip');
    const next = deltaOf(await adapter().pullChanges(cal, first.cursor, known));
    expect(next.changed.map((r) => r.href)).toEqual([href('standup')]);
    expect(next.changed[0]?.events[0]?.exdates).toHaveLength(2);
    expect(next.deleted).toEqual([href('trip')]);
  });

  test("Homa's UID is read back from its property, not Graph's iCalUId", async () => {
    const e = g.put('cal-1', { ...standup, recurrence: null, id: 'mine' });
    e.props = [{ id: HOMA_UID_PROPERTY, value: 'homa-1' }];
    const r = deltaOf(await adapter().pullChanges(cal, EMPTY_CURSOR));
    expect(r.changed[0]?.events[0]?.uid).toBe('homa-1');
  });

  test('a calendar gone in Outlook is a CalendarGoneError; throttling names Microsoft', async () => {
    g.state.missingCalendars.add('cal-1');
    expect(adapter().pullChanges(cal, EMPTY_CURSOR)).rejects.toBeInstanceOf(CalendarGoneError);
    g.state.missingCalendars.clear();
    g.state.throttle = 1;
    expect(adapter().pullChanges(cal, EMPTY_CURSOR)).rejects.toThrow('Microsoft is limiting requests');
  });
});

describe('push', () => {
  const ics = (summary: string, extra: Record<string, unknown> = {}): string =>
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
        rrule: null,
        exdates: [],
        rdates: [],
        ...extra,
      } as never,
      [],
    );

  test('create once (a retry returns the same event), patch, delete; stale changeKeys conflict', async () => {
    const a = adapter();
    const target = a.newHref('cal-1', 'homa-1');
    const created = await a.pushChange({ kind: 'put', href: target, ics: ics('Gym'), etag: null });
    const [stored] = [...g.events.values()];
    expect(created).toEqual({ etag: stored?.changeKey ?? '', href: href(stored?.id ?? '') });
    expect(stored).toMatchObject({
      subject: 'Gym',
      body: { contentType: 'text', content: 'Notes' },
      start: { dateTime: '2027-03-01T18:00:00', timeZone: 'GMT Standard Time' },
      props: [{ id: HOMA_UID_PROPERTY, value: 'homa-1' }],
    });
    // A retry (the answer was lost): Graph matches the transactionId.
    expect(await a.pushChange({ kind: 'put', href: target, ics: ics('Gym'), etag: null })).toEqual(created);
    expect(g.events.size).toBe(1);

    const patched = await a.pushChange({
      kind: 'put',
      href: created.href ?? '',
      ics: ics('Gym 2'),
      etag: created.etag,
    });
    expect(g.get(stored?.id ?? '')?.subject).toBe('Gym 2');
    expect(patched.etag).not.toBe(created.etag);
    await expect(
      a.pushChange({ kind: 'put', href: created.href ?? '', ics: ics('Gym 3'), etag: created.etag }),
    ).rejects.toBeInstanceOf(PushConflict);
    await expect(a.pushChange({ kind: 'delete', href: created.href ?? '', etag: 'stale' })).rejects.toBeInstanceOf(
      PushConflict,
    );
    await a.pushChange({ kind: 'delete', href: created.href ?? '', etag: patched.etag ?? '' });
    expect(g.events.size).toBe(0);
    // Already gone: done.
    expect(await a.pushChange({ kind: 'delete', href: created.href ?? '', etag: 'x' })).toEqual({ etag: null });
  });

  test("a series: its pattern, a changed occurrence and a cancelled one; RRULEs Outlook can't hold are refused", async () => {
    const a = adapter();
    const series = serializeEvent(
      {
        uid: 'homa-2',
        summary: 'Class',
        description: null,
        location: null,
        startAt: new Date('2027-03-01T18:00:00Z'),
        endAt: new Date('2027-03-01T19:00:00Z'),
        allDay: false,
        tz: 'Europe/London',
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
        exdates: [new Date('2027-03-15T18:00:00Z')],
        rdates: [],
      } as never,
      [
        {
          recurrenceId: new Date('2027-03-08T18:00:00Z'),
          summary: 'Class (moved)',
          description: null,
          location: null,
          startAt: new Date('2027-03-08T19:00:00Z'),
          endAt: new Date('2027-03-08T20:00:00Z'),
        },
      ] as never,
    );
    const pushed = await a.pushChange({ kind: 'put', href: a.newHref('cal-1', 'homa-2'), ics: series, etag: null });
    const [m] = [...g.events.values()];
    expect(m?.recurrence).toEqual({
      pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'], firstDayOfWeek: 'monday' },
      range: { type: 'numbered', startDate: '2027-03-01', numberOfOccurrences: 4 },
    });
    expect(m?.exceptions.get('2027-03-08T18:00:00Z')?.subject).toBe('Class (moved)');
    expect([...(m?.cancelled ?? [])]).toEqual(['2027-03-15T18:00:00Z']);
    expect(pushed.etag).toBe(m?.changeKey ?? '');

    // Read back, it's the same series.
    const [back] = deltaOf(await a.pullChanges(cal, EMPTY_CURSOR)).changed;
    expect(back?.etag).toBe(pushed.etag);
    expect(back?.events[0]).toMatchObject({ uid: 'homa-2', rrule: 'FREQ=WEEKLY;COUNT=4;BYDAY=MO' });
    expect(back?.events[0]?.exdates).toEqual([new Date('2027-03-15T18:00:00Z')]);
    expect(back?.events[0]?.overrides[0]).toMatchObject({
      summary: 'Class (moved)',
      startAt: new Date('2027-03-08T19:00:00Z'),
    });

    const hourly = ics('Every hour', { uid: 'homa-3', rrule: 'FREQ=HOURLY' });
    const refused = a.pushChange({ kind: 'put', href: a.newHref('cal-1', 'homa-3'), ics: hourly, etag: null });
    await expect(refused).rejects.toBeInstanceOf(PushError);
    await expect(refused).rejects.toMatchObject({ retriable: false });
  });

  test("Graph's refusals carry its message; 429 is retriable after Retry-After", async () => {
    const a = adapter();
    g.calendars[0] = { id: 'cal-1', name: 'Calendar', canEdit: false };
    const denied = a.pushChange({ kind: 'put', href: a.newHref('cal-1', 'homa-1'), ics: ics('Gym'), etag: null });
    await expect(denied).rejects.toThrow('Outlook refused the change (403): Access is denied.');
    g.calendars[0] = { id: 'cal-1', name: 'Calendar', canEdit: true };
    g.state.throttle = 1;
    const throttled = a.pushChange({ kind: 'put', href: a.newHref('cal-1', 'homa-1'), ics: ics('Gym'), etag: null });
    await expect(throttled).rejects.toMatchObject({ retriable: true, retryAfterMs: 7000 });
  });
});

describe('tokens', () => {
  test('an expired access token is refreshed, and the rotated refresh token stored', async () => {
    const a = adapter();
    g.state.accessToken = 'rotated-in-microsoft';
    const before = g.state.refreshToken;
    await a.listCalendars();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.refreshToken).not.toBe(before);
    expect(saved[0]?.refreshToken).toBe(g.state.refreshToken);
  });

  test('a revoked grant asks the user to connect again', async () => {
    const a = adapter();
    g.state.revoked = true;
    g.state.accessToken = 'expired';
    const failed = a.listCalendars();
    await expect(failed).rejects.toBeInstanceOf(SyncError);
    await expect(failed).rejects.toThrow(RECONNECT_MICROSOFT);
  });
});

test('reminders: only the one closest to the start goes to Outlook, and it comes back', async () => {
  const a = adapter();
  const ics = serializeEvent(
    {
      uid: 'homa-rem',
      summary: 'Dentist',
      description: null,
      location: null,
      startAt: new Date('2027-03-01T18:00:00Z'),
      endAt: new Date('2027-03-01T19:00:00Z'),
      allDay: false,
      tz: 'UTC',
      rrule: null,
      exdates: [],
      rdates: [],
    },
    [],
    new Date(),
    [
      { minutes: 15, action: 'display' },
      { minutes: 1440, action: 'display' },
    ],
  );
  const { href: at } = await a.pushChange({ kind: 'put', href: a.newHref('cal-1', 'homa-rem'), ics, etag: null });
  const stored = [...g.events.values()].find((e) => e.subject === 'Dentist');
  expect(stored).toMatchObject({ isReminderOn: true, reminderMinutesBeforeStart: 15 });
  expect((await a.fetchResource(at ?? ''))?.events[0]?.reminders).toEqual([{ minutes: 15, action: 'display' }]);
});
