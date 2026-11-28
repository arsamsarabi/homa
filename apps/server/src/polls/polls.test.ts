import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { closeDuePolls } from './polls-service';

type Json = Record<string, unknown>;
type Poll = {
  id: string;
  status: string;
  slots: { id: string; start: string }[];
  participants: { id: string; userId: string; responded: boolean }[];
  results: { slotId: string; points: number; eligible: boolean; requiredCannot: string[] }[];
  busy: { participantId: string; slotIds: string[] }[] | null;
  me: { participantId: string | null; organizer: boolean };
};

describe.skipIf(!testDatabaseUrl)('polls', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  const users: Record<'ada' | 'bob' | 'eve', { cookie: string; id: string; calendarId: string }> = {
    ada: { cookie: '', id: '', calendarId: '' },
    bob: { cookie: '', id: '', calendarId: '' },
    eve: { cookie: '', id: '', calendarId: '' },
  };

  const call = async (method: string, path: string, body?: unknown, as = users.ada.cookie) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const signUp = async (email: string): Promise<string> => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: email.split('@')[0] }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };

  // Three evenings in December 2027, far enough ahead for any deadline.
  const slots = ['2027-12-03T19:00:00Z', '2027-12-04T18:00:00Z', '2027-12-07T19:00:00Z'];
  const draft = (extra: Json = {}): Json => ({
    title: 'Book club',
    durationMinutes: 90,
    tz: 'Europe/London',
    slots,
    people: [{ userId: users.bob.id, required: false }],
    ...extra,
  });
  const create = async (extra: Json = {}): Promise<Poll> => {
    const res = await call('POST', '/polls', draft(extra));
    expect(res.status).toBe(201);
    return res.body as unknown as Poll;
  };
  const opened = async (extra: Json = {}): Promise<Poll> => {
    const p = await create(extra);
    const res = await call('POST', `/polls/${p.id}/open`);
    expect(res.status).toBe(200);
    return res.body as unknown as Poll;
  };
  const slotAt = (p: Poll, iso: string): string =>
    p.slots.find((s) => s.start === new Date(iso).toISOString())?.id ?? '';

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
    for (const name of ['ada', 'bob', 'eve'] as const) {
      users[name].cookie = await signUp(`${name}@example.com`);
      const me = await app.request('/api/auth/get-session', { headers: { cookie: users[name].cookie } });
      users[name].id = ((await me.json()) as { user: { id: string } }).user.id;
      const cals = await call('GET', '/calendars', undefined, users[name].cookie);
      users[name].calendarId = String((cals.body[0] as Json).id);
    }
  });
  afterEach(async () => {
    await t.db.delete(schema.polls);
    await t.db.delete(schema.events);
    await t.db.delete(schema.notifications);
  });
  afterAll(() => t.drop());

  test('a draft is the organizer’s alone; once sent, its people see it and others get 404', async () => {
    const p = await create();
    expect(p.status).toBe('draft');
    expect(p.participants.map((x) => x.userId).sort()).toEqual([users.ada.id, users.bob.id].sort());
    expect((await call('GET', `/polls/${p.id}`, undefined, users.bob.cookie)).status).toBe(404);
    await call('POST', `/polls/${p.id}/open`);
    expect((await call('GET', `/polls/${p.id}`, undefined, users.bob.cookie)).status).toBe(200);
    expect((await call('GET', `/polls/${p.id}`, undefined, users.eve.cookie)).status).toBe(404);
    expect((await call('PUT', `/polls/${p.id}/answers`, { ranked: [], cannot: [] }, users.eve.cookie)).status).toBe(
      404,
    );
    // Bob can see it but not change it.
    expect((await call('PATCH', `/polls/${p.id}`, { title: 'Mine now' }, users.bob.cookie)).status).toBe(403);
    const list = await call('GET', '/polls?view=answer', undefined, users.bob.cookie);
    expect((list.body as unknown as { id: string }[]).map((x) => x.id)).toEqual([p.id]);
    const bell = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.ownerUserId, users.bob.id));
    expect(bell.map((n) => n.title)).toEqual(['ada asks: when can you do Book club?']);
  });

  test('a patch changes only what it names', async () => {
    const p = await create({ location: 'Library', holds: true });
    const res = await call('PATCH', `/polls/${p.id}`, { title: 'Book club: Middlemarch' });
    expect(res.status).toBe(200);
    expect([res.body.title, res.body.location, res.body.holds]).toEqual(['Book club: Middlemarch', 'Library', true]);
  });

  test('sending needs two times and another person', async () => {
    const one = await create({ slots: [slots[0]] });
    expect((await call('POST', `/polls/${one.id}/open`)).status).toBe(400);
    const alone = await create({ people: [] });
    expect((await call('POST', `/polls/${alone.id}/open`)).status).toBe(400);
  });

  test('answers rank, results order them, and a required person who can’t rules a time out', async () => {
    const p = await opened({ people: [{ userId: users.bob.id, required: true }] });
    const [fri, sat, tue] = [
      slotAt(p, slots[0] as string),
      slotAt(p, slots[1] as string),
      slotAt(p, slots[2] as string),
    ];
    await call('PUT', `/polls/${p.id}/answers`, { ranked: [sat, fri], cannot: [tue] });
    const res = await call(
      'PUT',
      `/polls/${p.id}/answers`,
      { ranked: [fri, tue, fri], cannot: [sat] },
      users.bob.cookie,
    );
    expect(res.status).toBe(200);
    const after = res.body as unknown as Poll;
    expect(after.results.map((r) => [r.slotId, r.points, r.eligible])).toEqual([
      [fri, 1 + 2, true],
      [sat, 2, false],
      [tue, 1, false],
    ]);
    expect(after.results[1]?.requiredCannot).toEqual([after.me.participantId as string]);
  });

  test('the ballot starts with clashing times under can’t; the organizer sees busy marks', async () => {
    // Bob shares free/busy with Ada and has a dinner on the first evening.
    await call(
      'PUT',
      `/calendars/${users.bob.calendarId}/grants`,
      { defaultAccess: 'freebusy', grants: [] },
      users.bob.cookie,
    );
    await call(
      'POST',
      '/events',
      {
        calendarId: users.bob.calendarId,
        summary: 'Dinner',
        start: '2027-12-03T18:30:00Z',
        end: '2027-12-03T20:00:00Z',
        tz: 'UTC',
      },
      users.bob.cookie,
    );
    const p = await opened();
    const fri = slotAt(p, slots[0] as string);
    expect((await call('GET', `/polls/${p.id}/prefill`, undefined, users.bob.cookie)).body.cannot).toEqual([fri]);
    const bob = p.participants.find((x) => x.userId === users.bob.id);
    expect(p.busy?.find((b) => b.participantId === bob?.id)?.slotIds).toEqual([fri]);
  });

  test('finalizing makes the organizer’s event and copies for who ranked it; time and place stay put', async () => {
    const p = await opened({ location: 'Library' });
    const fri = slotAt(p, slots[0] as string);
    await call('PUT', `/polls/${p.id}/answers`, { ranked: [fri], cannot: [] }, users.bob.cookie);
    const done = await call('POST', `/polls/${p.id}/finalize`, { slotId: fri, calendarId: users.ada.calendarId });
    expect(done.status).toBe(200);
    expect((done.body as unknown as Poll).status).toBe('finalized');
    // A second click doesn't make a second set.
    expect(
      (await call('POST', `/polls/${p.id}/finalize`, { slotId: fri, calendarId: users.ada.calendarId })).status,
    ).toBe(400);

    const links = await t.db.select().from(schema.pollEvents).where(eq(schema.pollEvents.pollId, p.id));
    expect(links).toHaveLength(2);
    const own = links.find((l) => l.organizer);
    const copy = links.find((l) => !l.organizer);
    expect(copy?.userId).toBe(users.bob.id);

    const occ = await call(
      'GET',
      '/occurrences?from=2027-12-03T00:00:00Z&to=2027-12-04T00:00:00Z',
      undefined,
      users.bob.cookie,
    );
    expect(
      (occ.body as unknown as { summary: string; pollId: string; location: string }[]).map((o) => [
        o.summary,
        o.pollId,
        o.location,
      ]),
    ).toEqual([['Book club', p.id, 'Library']]);

    expect((await call('PATCH', `/events/${own?.eventId}`, { start: '2027-12-03T20:00:00Z' })).status).toBe(400);
    expect((await call('PATCH', `/events/${copy?.eventId}`, { location: 'Pub' }, users.bob.cookie)).status).toBe(400);
    // Unchanged values are fine (the editor sends them all).
    expect(
      (
        await call('PATCH', `/events/${own?.eventId}`, {
          start: '2027-12-03T19:00:00Z',
          summary: 'Book club: Middlemarch',
        })
      ).status,
    ).toBe(200);
    const [bobs] = await t.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, copy?.eventId as string));
    expect(bobs?.summary).toBe('Book club: Middlemarch');
    const bell = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.ownerUserId, users.bob.id));
    expect(bell.map((n) => n.pollEvent).sort()).toEqual(['finalized', 'opened', 'renamed']);
  });

  test('holds: every slot for the organizer, ranked ones for a participant who wants them, busy until the poll ends', async () => {
    const p = await opened({ holds: true });
    const fri = slotAt(p, slots[0] as string);
    await call('PUT', `/polls/${p.id}/answers`, { ranked: [fri], cannot: [], holds: true }, users.bob.cookie);
    const range = '?from=2027-12-01T00:00:00Z&to=2027-12-10T00:00:00Z';
    expect((await call('GET', `/holds${range}`)).body).toHaveLength(3);
    expect((await call('GET', `/holds${range}`, undefined, users.bob.cookie)).body).toHaveLength(1);
    const busy = await call('POST', '/availability', {
      from: '2027-12-01T00:00:00Z',
      to: '2027-12-10T00:00:00Z',
      userIds: [users.ada.id],
    });
    expect((busy.body.people as { busy: unknown[] }[])[0]?.busy).toHaveLength(3);
    await call('POST', `/polls/${p.id}/close`);
    expect((await call('GET', `/holds${range}`)).body).toHaveLength(0);
  });

  test('the job closes polls past their deadline and tells the organizer', async () => {
    const p = await opened({ deadline: '2027-05-01T00:00:00Z' });
    expect(await closeDuePolls(t.db, new Date('2027-04-30T12:00:00Z'))).toEqual({ closed: 0, reminded: 1 });
    expect(await closeDuePolls(t.db, new Date('2027-05-01T00:01:00Z'))).toEqual({ closed: 1, reminded: 0 });
    expect((await call('GET', `/polls/${p.id}`)).body.status).toBe('closed');
    const bell = await t.db.select().from(schema.notifications).where(eq(schema.notifications.pollId, p.id));
    expect(bell.map((n) => [n.ownerUserId === users.ada.id ? 'ada' : 'bob', n.pollEvent]).sort()).toEqual([
      ['ada', 'closed'],
      ['bob', 'closing'],
      ['bob', 'opened'],
    ]);
  });

  test('cancelling tells people; suggest finds times everyone required is free', async () => {
    const p = await opened();
    expect((await call('DELETE', `/polls/${p.id}`)).status).toBe(204);
    expect((await call('GET', `/polls/${p.id}`, undefined, users.bob.cookie)).body.status).toBe('cancelled');
    const s = await call('POST', '/polls/suggest', {
      from: '2027-12-06T00:00:00Z',
      to: '2027-12-07T00:00:00Z',
      durationMinutes: 60,
      tz: 'UTC',
      people: [{ userId: users.bob.id, required: true }],
      between: { from: '18:00', to: '21:00' },
    });
    expect(s.status).toBe(200);
    expect((s.body as unknown as { start: string }[]).map((x) => x.start)).toEqual([
      '2027-12-06T18:00:00.000Z',
      '2027-12-06T19:00:00.000Z',
      '2027-12-06T20:00:00.000Z',
    ]);
  });
});
