import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';

type Json = Record<string, unknown>;

describe.skipIf(!testDatabaseUrl)('calendar grant path rules', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let adaId = '';
  let bobId = '';
  let adaCalendar = '';
  let bobCalendar = '';

  const call = async (method: string, path: string, cookie: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const signUp = async (email: string, name: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name }),
    });
    const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    const session = await app.request('/api/auth/get-session', {
      headers: { origin: 'http://localhost:3000', cookie },
    });
    const json = (await session.json()) as { user?: { id: string } };
    return { cookie, id: json.user?.id ?? '' };
  };

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
    const a = await signUp('ada-grants@example.com', 'Ada');
    const b = await signUp('bob-grants@example.com', 'Bob');
    ada = a.cookie;
    bob = b.cookie;
    adaId = a.id;
    bobId = b.id;
    adaCalendar = String((await call('GET', '/calendars', ada)).body[0]?.id);
    bobCalendar = String((await call('GET', '/calendars', bob)).body[0]?.id);
  });
  afterAll(() => t.drop());

  test('a user with no grant sees only their own calendars', async () => {
    const { body } = await call('GET', '/calendars', bob);
    expect(body.map((c) => c.id)).toEqual([bobCalendar]);
    expect(body[0]).toMatchObject({ access: 'owner', owner: { id: bobId, name: 'Bob' } });
  });

  test('GET/PUT grants are owner only; PUT replaces the set and defaultAccess', async () => {
    expect((await call('GET', `/calendars/${adaCalendar}/grants`, bob)).status).toBe(404);
    expect(
      (await call('PUT', `/calendars/${adaCalendar}/grants`, bob, { defaultAccess: 'read', grants: [] })).status,
    ).toBe(404);

    const put = await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'read' }],
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'read' }],
    });
    expect((await call('GET', `/calendars/${adaCalendar}/grants`, ada)).body).toEqual(put.body);

    const cleared = await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: 'none',
      grants: [],
    });
    expect(cleared.body).toMatchObject({ defaultAccess: 'none', grants: [] });
  });

  test('shared calendars appear after own with access and owner; hidden is the viewer pref', async () => {
    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'freebusy' }],
    });
    const { body } = await call('GET', '/calendars', bob);
    expect(body.map((c) => c.id)).toEqual([bobCalendar, adaCalendar]);
    expect(body[1]).toMatchObject({
      access: 'freebusy',
      owner: { id: adaId, name: 'Ada' },
      hidden: false,
    });
    const hid = await call('PATCH', `/calendars/${adaCalendar}`, bob, { hidden: true });
    expect(hid.status).toBe(200);
    expect(hid.body.hidden).toBe(true);
    expect((await call('PATCH', `/calendars/${adaCalendar}`, bob, { name: 'Nope' })).status).toBe(404);
    // Ada's own hidden flag is unchanged.
    expect((await call('GET', '/calendars', ada)).body[0]?.hidden).toBe(false);
  });

  test('a grantee picks their own color for a shared calendar; the owner keeps theirs', async () => {
    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'read' }],
    });
    const ownColor = (await call('GET', '/calendars', ada)).body[0]?.color;
    const set = await call('PATCH', `/calendars/${adaCalendar}`, bob, { color: '#3b9492' });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ color: '#3b9492', access: 'read' });
    expect((await call('GET', '/calendars', bob)).body.find((c) => c.id === adaCalendar)?.color).toBe('#3b9492');
    expect((await call('GET', '/calendars', ada)).body[0]?.color).toBe(ownColor);
    // Changing the color alone leaves the hidden pref as it was.
    await call('PATCH', `/calendars/${adaCalendar}`, bob, { hidden: true });
    const both = await call('PATCH', `/calendars/${adaCalendar}`, bob, { color: '#4f8fc0' });
    expect(both.body).toMatchObject({ color: '#4f8fc0', hidden: true });
    await call('PATCH', `/calendars/${adaCalendar}`, bob, { hidden: false });
  });

  test('occurrences name who added the event; free/busy hides it', async () => {
    await t.db.delete(schema.events);
    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'edit' }],
    });
    const event = (summary: string, start: string) => ({
      calendarId: adaCalendar,
      summary,
      start,
      end: start.replace('T10', 'T11'),
      tz: 'UTC',
    });
    expect((await call('POST', '/events', ada, event('By Ada', '2026-07-01T10:00:00Z'))).status).toBe(201);
    expect((await call('POST', '/events', bob, event('By Bob', '2026-07-02T10:00:00Z'))).status).toBe(201);
    const range = '/occurrences?from=2026-07-01T00:00:00Z&to=2026-07-03T00:00:00Z';
    const seen = (await call('GET', range, ada)).body as unknown as Json[];
    expect(seen.map((o) => [o.summary, o.createdBy])).toEqual([
      ['By Ada', { id: adaId, name: 'Ada' }],
      ['By Bob', { id: bobId, name: 'Bob' }],
    ]);

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'freebusy' }],
    });
    const busy = (await call('GET', range, bob)).body as unknown as Json[];
    expect(busy.map((o) => o.createdBy)).toEqual([null, null]);
  });

  test('occurrences: freebusy strips titles; none yields nothing; read keeps details without taskId', async () => {
    await t.db.delete(schema.events);
    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'freebusy' }],
    });
    const made = await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Secret',
      description: 'private notes',
      location: 'HQ',
      start: '2026-06-01T10:00:00Z',
      end: '2026-06-01T11:00:00Z',
      tz: 'UTC',
    });
    expect(made.status).toBe(201);
    const eventId = String(made.body.id);

    const busy = (await call('GET', '/occurrences?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z', bob))
      .body as unknown as Json[];
    expect(busy).toHaveLength(1);
    expect(busy[0]).toMatchObject({
      eventId,
      summary: '',
      description: null,
      location: null,
      recurring: false,
      overridden: false,
      taskId: null,
      start: '2026-06-01T10:00:00.000Z',
      end: '2026-06-01T11:00:00.000Z',
    });

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'none' }],
    });
    expect(
      ((await call('GET', '/occurrences?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z', bob)).body as unknown[])
        .length,
    ).toBe(0);

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'read' }],
    });
    const read = (await call('GET', '/occurrences?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z', bob))
      .body as unknown as Json[];
    expect(read[0]).toMatchObject({
      summary: 'Secret',
      description: 'private notes',
      location: 'HQ',
      taskId: null,
    });
  });

  test('GET event needs read+; freebusy and no grant are 404; reminders empty for grantee', async () => {
    await t.db.delete(schema.events);
    const made = await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Sync',
      start: '2026-07-01T10:00:00Z',
      end: '2026-07-01T11:00:00Z',
      tz: 'UTC',
      reminders: [10],
    });
    const id = String(made.body.id);

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'freebusy' }],
    });
    expect((await call('GET', `/events/${id}`, bob)).status).toBe(404);

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'read' }],
    });
    const got = await call('GET', `/events/${id}`, bob);
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ summary: 'Sync', reminders: [] });
    expect((await call('GET', `/events/${id}`, ada)).body.reminders).toEqual([10]);

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, { defaultAccess: null, grants: [] });
    expect((await call('GET', `/events/${id}`, bob)).status).toBe(404);
  });

  test('POST/PATCH/DELETE need edit; read is 404 on change; cannot move to another owner', async () => {
    await t.db.delete(schema.events);
    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'read' }],
    });
    expect(
      (
        await call('POST', '/events', bob, {
          calendarId: adaCalendar,
          summary: 'Nope',
          start: '2026-08-01T10:00:00Z',
          end: '2026-08-01T11:00:00Z',
          tz: 'UTC',
        })
      ).status,
    ).toBe(400);

    const owned = await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Ada event',
      start: '2026-08-01T10:00:00Z',
      end: '2026-08-01T11:00:00Z',
      tz: 'UTC',
    });
    expect((await call('PATCH', `/events/${owned.body.id}`, bob, { summary: 'x' })).status).toBe(404);
    expect((await call('DELETE', `/events/${owned.body.id}`, bob)).status).toBe(404);

    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'edit' }],
    });
    const created = await call('POST', '/events', bob, {
      calendarId: adaCalendar,
      summary: 'Bob wrote',
      start: '2026-08-02T10:00:00Z',
      end: '2026-08-02T11:00:00Z',
      tz: 'UTC',
      reminders: [5],
    });
    expect(created.status).toBe(201);
    expect(created.body.reminders).toEqual([]);
    const [bobWrote] = await t.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, String(created.body.id)));
    expect(bobWrote?.ownerUserId).toBe(adaId);

    expect((await call('PATCH', `/events/${created.body.id}`, bob, { summary: 'Bob edited' })).status).toBe(200);
    expect((await call('PATCH', `/events/${created.body.id}`, bob, { calendarId: bobCalendar })).status).toBe(400);

    expect((await call('DELETE', `/events/${created.body.id}`, bob)).status).toBe(204);
  });

  test('reminders PUT and import are owner only; export stays own rows', async () => {
    await t.db.delete(schema.events);
    await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
      defaultAccess: null,
      grants: [{ userId: bobId, level: 'edit' }],
    });
    const made = await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Alarm',
      start: '2026-09-01T10:00:00Z',
      end: '2026-09-01T11:00:00Z',
      tz: 'UTC',
    });
    expect((await call('PUT', `/events/${made.body.id}/reminders`, bob, { reminders: [15] })).status).toBe(404);
    expect((await call('PUT', `/events/${made.body.id}/reminders`, ada, { reminders: [15] })).status).toBe(200);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:grant-import@example.com',
      'SUMMARY:Imported',
      'DTSTART:20260902T100000Z',
      'DTEND:20260902T110000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const bobImport = await app.request(`/api/calendars/${adaCalendar}/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/calendar', origin: 'http://localhost:3000', cookie: bob },
      body: ics,
    });
    expect(bobImport.status).toBe(404);

    await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Owner only export',
      start: '2026-09-03T10:00:00Z',
      end: '2026-09-03T11:00:00Z',
      tz: 'UTC',
    });
    const bobExport = await call('GET', '/export', bob);
    expect(bobExport.status).toBe(200);
    const doc = bobExport.body as unknown as { events: Json[]; calendars: Json[] };
    expect(JSON.stringify(doc)).not.toContain('Owner only export');
    expect(JSON.stringify(doc)).not.toContain('Alarm');
    expect(doc.calendars.map((c) => c.id)).toEqual([bobCalendar]);
  });

  test('sharingPreset is on settings GET/PATCH', async () => {
    const got = await call('GET', '/settings', ada);
    expect(got.body).toMatchObject({ sharingPreset: 'private' });
    const patched = await call('PATCH', '/settings', ada, { sharingPreset: 'freebusy' });
    expect(patched.body).toMatchObject({ sharingPreset: 'freebusy' });
    expect((await call('PATCH', '/settings', ada, { sharingPreset: 'edit' })).status).toBe(400);
  });
});
