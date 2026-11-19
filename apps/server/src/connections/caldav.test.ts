// Two-way CalDAV sync against a real Radicale (TEST_CALDAV_URL, for example http://127.0.0.1:5232,
// started with --auth-type none so any password works). Skipped without it or TEST_DATABASE_URL.
// Loopback is reachable only because these settings allow private networks.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { schema } from '@homa/db';
import { DEFAULT_FETCH_POLICY, parseCredentialKey } from '@homa/sync';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { pushDueOutboxes } from './sync-service';
import type { SyncSettings } from './sync-settings';

const davUrl = process.env.TEST_CALDAV_URL;

type CalendarJson = { id: string; name: string; color: string; readOnly: boolean };
type ConnectionJson = {
  id: string;
  label: string | null;
  status: string;
  lastError: string | null;
  notice: string | null;
  calendars: CalendarJson[];
};
type EventJson = { id: string; uid: string; summary: string; calendarId: string };
type RemoteJson = { remoteId: string; name: string | null; color: string | null; readOnly: boolean; selected: boolean };

const settings: SyncSettings = {
  key: parseCredentialKey(randomBytes(32).toString('base64')),
  intervalMinutes: 30,
  policy: { ...DEFAULT_FETCH_POLICY, allowPrivate: true, timeoutMs: 10_000 },
};

// A fresh Radicale user per run, so runs never see each other's calendars.
const user = `ada${randomBytes(4).toString('hex')}`;
const auth = { authorization: `Basic ${Buffer.from(`${user}:app-password`).toString('base64')}` };
const remote = (path: string): string => new URL(`/${user}/${path}`, davUrl).href;

async function dav(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, { method, body, headers: { ...auth, ...headers } });
}

const mkcalendar = (path: string, name: string, comp = 'VEVENT'): Promise<Response> =>
  dav(
    'MKCALENDAR',
    remote(path),
    `<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>${name}</D:displayname><I:calendar-color xmlns:I="http://apple.com/ns/ical/">#336699FF</I:calendar-color><C:supported-calendar-component-set><C:comp name="${comp}"/></C:supported-calendar-component-set></D:prop></D:set></C:mkcalendar>`,
  );

const vcalendar = (...lines: string[]): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR', ''].join('\r\n');
const vevent = (uid: string, summary: string, ...extra: string[]): string[] => [
  'BEGIN:VEVENT',
  `UID:${uid}`,
  'DTSTAMP:20270101T000000Z',
  `SUMMARY:${summary}`,
  ...extra,
  'END:VEVENT',
];

/** The remote object's text (null if it's gone) and its ETag. */
async function getRemote(url: string): Promise<{ text: string | null; etag: string | null }> {
  const res = await dav('GET', url);
  return res.status === 404 ? { text: null, etag: null } : { text: await res.text(), etag: res.headers.get('etag') };
}

/** The .ics hrefs in a remote calendar. */
async function listRemote(path: string): Promise<string[]> {
  const res = await dav('PROPFIND', remote(path), '<propfind xmlns="DAV:"><prop><getetag/></prop></propfind>', {
    depth: '1',
  });
  return [...(await res.text()).matchAll(/<href>([^<]+\.ics)<\/href>/g)].map((m) => new URL(m[1] ?? '', davUrl).href);
}

describe.skipIf(!testDatabaseUrl || !davUrl)('CalDAV two-way sync (Radicale)', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let conn: ConnectionJson;
  let work: CalendarJson;

  const req = (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
    Promise.resolve(
      app.request(`/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const json = async <T>(res: Response | Promise<Response>): Promise<T> => (await res).json() as Promise<T>;
  const signUp = async (email: string): Promise<string> => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const summaries = async (): Promise<string[]> =>
    (
      await json<{ summary: string; calendarId: string }[]>(
        req('GET', '/occurrences?from=2027-03-01T00:00:00Z&to=2027-04-30T00:00:00Z', ada),
      )
    )
      .filter((o) => o.calendarId === work.id)
      .map((o) => o.summary);
  const syncNow = (): Promise<ConnectionJson> => json<ConnectionJson>(req('POST', `/connections/${conn.id}/sync`, ada));
  const eventByUid = async (uid: string): Promise<typeof schema.events.$inferSelect | undefined> =>
    (await t.db.select().from(schema.events).where(eq(schema.events.uid, uid)))[0];

  beforeAll(async () => {
    expect((await mkcalendar('work/', 'Work')).status).toBe(201);
    expect((await mkcalendar('home/', 'Home')).status).toBe(201);
    expect((await mkcalendar('todo/', 'Chores', 'VTODO')).status).toBe(201);
    await dav(
      'PUT',
      remote('work/standup.ics'),
      vcalendar(
        ...vevent(
          'standup@remote',
          'Stand-up',
          'DTSTART;TZID=Europe/London:20270301T090000',
          'DTEND;TZID=Europe/London:20270301T091500',
          'RRULE:FREQ=WEEKLY;COUNT=8',
        ),
      ),
      { 'content-type': 'text/calendar' },
    );
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db), sync: settings });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
  });
  afterAll(async () => {
    for (const path of ['work/', 'home/', 'todo/']) await dav('DELETE', remote(path));
    await t?.drop();
  });

  test('discovery finds the event calendars; the app password is stored encrypted, never returned', async () => {
    const bad = await req('POST', '/connections/caldav', ada, {
      serverUrl: new URL('/nothing-here/', davUrl).href.replace('http://', 'ftp://'),
      username: user,
      password: 'app-password',
    });
    expect(bad.status).toBe(400);

    const res = await req('POST', '/connections/caldav', ada, {
      serverUrl: davUrl,
      username: user,
      password: 'app-password',
    });
    expect(res.status).toBe(201);
    conn = (await res.json()) as ConnectionJson;
    expect(conn).toMatchObject({ label: `${user} on 127.0.0.1`, calendars: [], notice: null });
    expect(JSON.stringify(conn)).not.toContain('app-password');
    const [row] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    expect(row?.credentials).not.toContain('app-password');

    const list = await json<RemoteJson[]>(req('GET', `/connections/${conn.id}/remote-calendars`, ada));
    expect(list.map((c) => c.name).sort()).toEqual(['Home', 'Work']); // the to-do list is left out
    expect(list.find((c) => c.name === 'Work')).toMatchObject({
      remoteId: remote('work/'),
      color: '#336699',
      readOnly: false,
      selected: false,
    });
  });

  test('choosing calendars creates local ones and pulls their events', async () => {
    const bad = await req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: ['http://elsewhere/'] });
    expect(bad.status).toBe(400);
    conn = await json<ConnectionJson>(
      req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: [remote('work/'), remote('home/')] }),
    );
    expect(conn).toMatchObject({ status: 'ok', lastError: null });
    expect(conn.calendars.map((c) => c.name).sort()).toEqual(['Home', 'Work']);
    work = conn.calendars.find((c) => c.name === 'Work') as CalendarJson;
    expect(work).toMatchObject({ readOnly: false, color: '#336699' });
    expect(await summaries()).toEqual(Array(8).fill('Stand-up'));
    expect(await eventByUid('standup@remote')).toMatchObject({ remoteHref: remote('work/standup.ics') });

    // Unchoosing one removes the local copy only.
    conn = await json<ConnectionJson>(
      req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: [remote('work/')] }),
    );
    expect(conn.calendars.map((c) => c.name)).toEqual(['Work']);
    expect((await dav('PROPFIND', remote('home/'), undefined, { depth: '0' })).status).toBe(207);
  });

  test('incremental pulls bring remote changes, additions and deletions', async () => {
    await dav(
      'PUT',
      remote('work/review.ics'),
      vcalendar(...vevent('review@remote', 'Review', 'DTSTART:20270310T140000Z', 'DTEND:20270310T150000Z')),
    );
    await dav(
      'PUT',
      remote('work/standup.ics'),
      vcalendar(
        ...vevent(
          'standup@remote',
          'Daily stand-up',
          'DTSTART;TZID=Europe/London:20270301T090000',
          'DTEND;TZID=Europe/London:20270301T091500',
          'RRULE:FREQ=WEEKLY;COUNT=2',
        ),
      ),
    );
    expect(await syncNow()).toMatchObject({ status: 'ok' });
    expect(await summaries()).toEqual(['Daily stand-up', 'Daily stand-up', 'Review']);

    await dav('DELETE', remote('work/review.ics'));
    expect(await syncNow()).toMatchObject({ status: 'ok' });
    expect(await summaries()).toEqual(['Daily stand-up', 'Daily stand-up']);
  });

  test('local creates, edits and deletes are pushed with ETags', async () => {
    const created = await json<EventJson>(
      req('POST', '/events', ada, {
        calendarId: work.id,
        summary: 'Lunch',
        start: '2027-03-12T12:00:00Z',
        end: '2027-03-12T13:00:00Z',
        tz: 'Europe/London',
      }),
    );
    expect(await pushDueOutboxes(t.db, settings)).toEqual({ connections: 1, busy: 0, failed: 0 });
    const stored = await eventByUid(created.uid);
    expect(stored?.remoteHref).toStartWith(remote('work/'));
    const pushed = await getRemote(stored?.remoteHref ?? '');
    expect(pushed.text).toContain('SUMMARY:Lunch');
    expect(pushed.text).toContain(`UID:${created.uid}`);
    expect(stored?.remoteEtag).toBe(pushed.etag);

    await req('PATCH', `/events/${created.id}`, ada, { summary: 'Team lunch' });
    expect(await pushDueOutboxes(t.db, settings)).toMatchObject({ connections: 1 });
    expect((await getRemote(stored?.remoteHref ?? '')).text).toContain('SUMMARY:Team lunch');
    // Our own push comes back in the next pull as unchanged, not as a conflict.
    expect(await syncNow()).toMatchObject({ status: 'ok', notice: null });

    expect((await req('DELETE', `/events/${created.id}`, ada)).status).toBe(204);
    expect(await pushDueOutboxes(t.db, settings)).toMatchObject({ connections: 1 });
    expect((await getRemote(stored?.remoteHref ?? '')).text).toBeNull();
    // Nothing left to push.
    expect(await pushDueOutboxes(t.db, settings)).toEqual({ connections: 0, busy: 0, failed: 0 });
  });

  test('"this" and "this and following" edits give the right remote objects', async () => {
    const series = await json<EventJson>(
      req('POST', '/events', ada, {
        calendarId: work.id,
        summary: 'Gym',
        start: '2027-03-02T07:00:00Z',
        end: '2027-03-02T08:00:00Z',
        tz: 'Europe/London',
        rrule: 'FREQ=WEEKLY;COUNT=6',
      }),
    );
    // One occurrence moved: an override with RECURRENCE-ID in the same object.
    await req('PATCH', `/events/${series.id}?scope=this&recurrenceId=2027-03-09T07:00:00.000Z`, ada, {
      summary: 'Gym (late)',
      start: '2027-03-09T18:00:00Z',
      end: '2027-03-09T19:00:00Z',
    });
    await syncNow();
    const href = (await eventByUid(series.uid))?.remoteHref ?? '';
    const one = (await getRemote(href)).text ?? '';
    expect(one).toContain('RECURRENCE-ID;TZID=Europe/London:20270309T070000');
    expect(one).toContain('SUMMARY:Gym (late)');

    // From the fourth on: the old series ends before it, and a new object holds the rest.
    const following = await json<EventJson>(
      req('PATCH', `/events/${series.id}?scope=following&recurrenceId=2027-03-23T07:00:00.000Z`, ada, {
        summary: 'Swim',
      }),
    );
    expect(following.uid).not.toBe(series.uid);
    await syncNow();
    const old = (await getRemote(href)).text ?? '';
    expect(old).toMatch(/RRULE:FREQ=WEEKLY;(UNTIL=20270323T065959Z|COUNT=3)/);
    const created = (await eventByUid(following.uid))?.remoteHref ?? '';
    expect(created).not.toBe(href);
    const rest = (await getRemote(created)).text ?? '';
    expect(rest).toContain('SUMMARY:Swim');
    expect(rest).toContain('DTSTART;TZID=Europe/London:20270323T070000');
    expect(await listRemote('work/')).toEqual(expect.arrayContaining([href, created]));
    // Re-pulling from scratch gives the same calendar back.
    await t.db.update(schema.calendars).set({ syncToken: null }).where(eq(schema.calendars.id, work.id));
    const before = await summaries();
    expect(await syncNow()).toMatchObject({ status: 'ok', notice: null });
    expect(await summaries()).toEqual(before);
  });

  test('a conflict (412) keeps the server copy and leaves a notice; the notice can be dismissed', async () => {
    const href = remote('work/standup.ics');
    const { text } = await getRemote(href);
    // Changed on the server after Homa's last pull…
    await dav('PUT', href, (text ?? '').replace('SUMMARY:Daily stand-up', 'SUMMARY:Stand-up (server)'));
    // …and locally before the next one.
    const local = await eventByUid('standup@remote');
    await req('PATCH', `/events/${local?.id}`, ada, { summary: 'Stand-up (mine)' });
    const after = await syncNow();
    expect(after.status).toBe('ok');
    expect(after.notice).toContain('"Stand-up (mine)" conflicted with a change on the server');
    expect((await eventByUid('standup@remote'))?.summary).toBe('Stand-up (server)');
    expect((await getRemote(href)).text).toContain('SUMMARY:Stand-up (server)');

    expect((await req('DELETE', `/connections/${conn.id}/notice`, ada)).status).toBe(204);
    expect((await json<ConnectionJson[]>(req('GET', '/connections', ada)))[0]?.notice).toBeNull();
  });

  test("another user can't see, change or sync the connection", async () => {
    expect((await json<ConnectionJson[]>(req('GET', '/connections', bob))).map((c) => c.id)).not.toContain(conn.id);
    expect((await req('GET', `/connections/${conn.id}/remote-calendars`, bob)).status).toBe(404);
    expect((await req('PUT', `/connections/${conn.id}/calendars`, bob, { remoteIds: [] })).status).toBe(404);
    expect((await req('POST', `/connections/${conn.id}/sync`, bob)).status).toBe(404);
    expect((await req('DELETE', `/connections/${conn.id}/notice`, bob)).status).toBe(404);
    expect((await req('DELETE', `/connections/${conn.id}`, bob)).status).toBe(404);
    const local = await eventByUid('standup@remote');
    expect((await req('PATCH', `/events/${local?.id}`, bob, { summary: 'x' })).status).toBe(404);
  });

  test('removing the connection leaves the server alone', async () => {
    expect((await req('DELETE', `/connections/${conn.id}`, ada)).status).toBe(204);
    expect((await getRemote(remote('work/standup.ics'))).text).toContain('Stand-up (server)');
  });
});
