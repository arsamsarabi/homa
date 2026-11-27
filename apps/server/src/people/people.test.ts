// People end to end on a throwaway database: invites (who may create them, closed sign-ups, single
// use, the named address, the emailed link), the directory and circles (ownership, members).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import type { Mail, NotifySettings } from '@/reminders';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';

type Json = Record<string, unknown>;
const ORIGIN = 'http://localhost:3000';

describe.skipIf(!testDatabaseUrl)('people', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  const mails: Mail[] = [];
  let ada = ''; // the admin
  let bob = '';
  let bobId = '';

  const call = async (method: string, path: string, body?: unknown, as = ada) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const signUp = async (email: string, invite?: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...(invite && { 'x-homa-invite': invite }) },
      body: JSON.stringify({ email, password: 'correct horse battery', name: email.split('@')[0] }),
    });
    return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '', body: await res.json() };
  };
  const userId = async (email: string): Promise<string> => {
    const [u] = await t.db.select().from(schema.users).where(eq(schema.users.email, email));
    return String(u?.id);
  };
  const setInstance = (patch: Json) => call('PATCH', '/admin/instance', patch);

  beforeAll(async () => {
    t = await freshDb();
    const notify: NotifySettings = {
      key: undefined,
      allowPrivate: false,
      appUrl: ORIGIN,
      sendMail: async (m: Mail): Promise<void> => {
        mails.push(m);
      },
    };
    app = createApp({ db: t.db, auth: testAuth(t.db), notify });
    ada = (await signUp('ada@example.com')).cookie;
    bob = (await signUp('bob@example.com')).cookie;
    bobId = await userId('bob@example.com');
  });
  afterAll(() => t.drop());

  test('only admins invite unless the instance lets everyone', async () => {
    expect((await call('POST', '/invites', {}, bob)).status).toBe(403);
    expect((await call('POST', '/invites', {})).status).toBe(201);
    await setInstance({ invites: 'everyone' });
    expect((await call('POST', '/invites', {}, bob)).status).toBe(201);
    await setInstance({ invites: 'admins' });
    expect((await call('PATCH', '/admin/instance', { invites: 'everyone' }, bob)).status).toBe(403);
  });

  test('an invite gets past closed sign-ups, once', async () => {
    await setInstance({ signUps: 'closed' });
    expect((await signUp('carol@example.com')).status).toBe(400);

    const invite = await call('POST', '/invites', {});
    const token = String(invite.body.token);
    expect(token.length).toBeGreaterThan(40);
    // The token is never stored, only its hash.
    const [row] = await t.db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.id, String(invite.body.id)));
    expect(row?.tokenHash).not.toBe(token);

    const lookup = await app.request(`/api/invite-lookup?token=${token}`);
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toEqual({ instanceName: 'Homa', invitedBy: 'ada', email: null });

    expect((await signUp('carol@example.com', 'not-a-real-token')).status).toBe(400);
    const carol = await signUp('carol@example.com', token);
    expect(carol.status).toBe(200);
    expect((await signUp('dan@example.com', token)).status).toBe(400);
    expect((await app.request(`/api/invite-lookup?token=${token}`)).status).toBe(404);

    const listed = (await call('GET', '/invites')).body.find((i) => i.id === invite.body.id);
    expect(listed?.usedBy).toEqual({ id: await userId('carol@example.com'), name: 'carol' });
    // New people join the inviter's "Invited" circle, ready to share with.
    const invited = (await call('GET', '/circles')).body.find((c) => c.name === 'Invited');
    expect(invited?.memberIds).toEqual([await userId('carol@example.com')]);
    await setInstance({ signUps: 'open' });
  });

  test('an invite for an address works only for it; emailed, it confirms the address', async () => {
    const from = mails.length;
    const invite = await call('POST', '/invites', { email: 'Erin@Example.com' });
    expect(invite.status).toBe(201);
    expect(invite.body.email).toBe('erin@example.com');
    expect(invite.body.emailed).toBe(true);
    const mail = mails[from];
    expect(mail?.to).toBe('erin@example.com');
    expect(mail?.subject).toBe('ada invited you to Homa on Homa');
    expect(mail?.text).toContain(`${ORIGIN}/sign-up?invite=${invite.body.token}`);

    const other = await signUp('frank@example.com', String(invite.body.token));
    expect(other.status).toBe(400);
    expect((other.body as Json).message).toBe('This invite is for another email address.');
    const erin = await signUp('erin@example.com', String(invite.body.token));
    expect(erin.status).toBe(200);
    const [u] = await t.db.select().from(schema.users).where(eq(schema.users.email, 'erin@example.com'));
    expect(u?.emailVerified).toBe(true);

    // An address that already has an account can't be invited.
    expect((await call('POST', '/invites', { email: 'bob@example.com' })).status).toBe(400);
  });

  test('a copied invite link does not confirm the address', async () => {
    const before = mails.length;
    const noMail = createApp({ db: t.db, auth: testAuth(t.db) });
    const res = await noMail.request('/api/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: ada },
      body: JSON.stringify({ email: 'gina@example.com' }),
    });
    const invite = (await res.json()) as Json;
    expect(invite.emailed).toBe(false);
    expect(mails.length).toBe(before);
    expect((await signUp('gina@example.com', String(invite.token))).status).toBe(200);
    const [u] = await t.db.select().from(schema.users).where(eq(schema.users.email, 'gina@example.com'));
    expect(u?.emailVerified).toBe(false);
  });

  test('people see their own invites; admins see and revoke all', async () => {
    await setInstance({ invites: 'everyone' });
    const bobs = await call('POST', '/invites', {}, bob);
    const adas = await call('POST', '/invites', {});
    await setInstance({ invites: 'admins' });

    const seen = (await call('GET', '/invites', undefined, bob)).body.map((i) => i.id);
    expect(seen).toContain(bobs.body.id);
    expect(seen).not.toContain(adas.body.id);
    expect((await call('GET', '/invites')).body.map((i) => i.id)).toContain(bobs.body.id);

    expect((await call('DELETE', `/invites/${adas.body.id}`, undefined, bob)).status).toBe(404);
    expect((await call('DELETE', `/invites/${bobs.body.id}`, undefined, bob)).status).toBe(204);
    expect((await call('DELETE', `/invites/${adas.body.id}`)).status).toBe(204);
    expect((await app.request(`/api/invite-lookup?token=${adas.body.token}`)).status).toBe(404);
  });

  test('signed-out callers get nothing', async () => {
    for (const path of ['/people', '/invites', '/circles'])
      expect((await call('GET', path, undefined, '')).status).toBe(401);
    expect((await call('POST', '/invites', {}, '')).status).toBe(401);
  });

  test('the directory lists everyone else, not banned accounts', async () => {
    const people = (await call('GET', '/people', undefined, bob)).body;
    expect(people.map((p) => p.email)).toContain('ada@example.com');
    expect(people.map((p) => p.email)).not.toContain('bob@example.com');
    await t.db.update(schema.users).set({ banned: true }).where(eq(schema.users.email, 'gina@example.com'));
    expect((await call('GET', '/people')).body.map((p) => p.email)).not.toContain('gina@example.com');
  });

  test('circles belong to their owner and hold other people', async () => {
    const carolId = await userId('carol@example.com');
    const family = await call('POST', '/circles', {
      name: 'Family',
      memberIds: [bobId, carolId, bobId],
      color: '#669070',
      avatarSeed: 'family-seed',
    });
    expect(family.status).toBe(201);
    expect(family.body).toMatchObject({
      color: '#669070',
      avatarSeed: 'family-seed',
      avatarImage: null,
    });
    expect([...(family.body.memberIds as string[])].sort()).toEqual([bobId, carolId].sort());
    const id = String(family.body.id);

    expect((await call('POST', '/circles', { name: 'family' })).status).toBe(400);
    expect(
      (await call('POST', '/circles', { name: 'Self', memberIds: [await userId('ada@example.com')] })).status,
    ).toBe(400);
    expect((await call('POST', '/circles', { name: 'Ghosts', memberIds: ['nobody'] })).status).toBe(400);

    // Bob can't see, change or delete Ada's circle, though he is in it.
    expect((await call('GET', '/circles', undefined, bob)).body.length).toBe(0);
    expect((await call('PATCH', `/circles/${id}`, { name: 'Mine' }, bob)).status).toBe(404);
    expect((await call('PUT', `/circles/${id}/members`, { memberIds: [] }, bob)).status).toBe(404);
    expect((await call('DELETE', `/circles/${id}`, undefined, bob)).status).toBe(404);

    expect((await call('PATCH', `/circles/${id}`, { name: 'Close family' })).body.name).toBe('Close family');
    const recolored = await call('PATCH', `/circles/${id}`, {
      color: '#c2575b',
      avatarSeed: 'shuffled',
      avatarImage: 'data:image/png;base64,abc',
    });
    expect(recolored.body).toMatchObject({
      name: 'Close family',
      color: '#c2575b',
      avatarSeed: 'shuffled',
      avatarImage: 'data:image/png;base64,abc',
    });
    expect((await call('PUT', `/circles/${id}/members`, { memberIds: [carolId] })).body.memberIds).toEqual([carolId]);
    expect((await call('GET', '/circles')).body.map((c) => c.name)).toEqual(['Close family', 'Invited']);
    expect((await call('DELETE', `/circles/${id}`)).status).toBe(204);
    expect(await t.db.$count(schema.circleMembers, eq(schema.circleMembers.circleId, id))).toBe(0);
  });

  test('a new circle gets a colour and avatar seed when none are sent', async () => {
    const made = await call('POST', '/circles', { name: 'Defaults' });
    expect(made.status).toBe(201);
    expect(made.body.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(String(made.body.avatarSeed).length).toBeGreaterThan(0);
    expect(made.body.avatarImage).toBeNull();
  });
});
