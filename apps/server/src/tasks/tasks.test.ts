// Tasks, projects and tags end to end on a throwaway database: the API, ownership, subtasks,
// tags, repeating tasks, limits and the JSON export.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { completeTask } from './tasks-service';

type Json = Record<string, unknown>;

describe.skipIf(!testDatabaseUrl)('tasks', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let adaId = '';

  const call = async (method: string, path: string, body?: unknown, as = ada) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const signUp = async (email: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const task = async (body: Json, as = ada): Promise<Json> => {
    const res = await call('POST', '/tasks', { tz: 'Europe/London', ...body }, as);
    expect(res.status).toBe(201);
    return res.body;
  };
  const open = async (as = ada): Promise<Json[]> => (await call('GET', '/tasks', undefined, as)).body;

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
    const [u] = await t.db.select().from(schema.users);
    adaId = String(u?.id);
  });
  beforeEach(async () => {
    await t.db.delete(schema.tasks);
    await t.db.delete(schema.projects);
    await t.db.delete(schema.tags);
  });
  afterAll(async () => {
    await t.drop();
  });

  test('routes need a session', async () => {
    for (const path of ['/tasks', '/projects', '/tags'])
      expect((await call('GET', path, undefined, '')).status).toBe(401);
  });

  test('a task with only a title goes to the Inbox with nothing else set', async () => {
    const created = await task({ title: '  Buy milk ' });
    expect(created).toMatchObject({
      title: 'Buy milk',
      notes: null,
      projectId: null,
      parentId: null,
      tags: [],
      priority: 0,
      dueDate: null,
      dueTime: null,
      tz: 'Europe/London',
      rrule: null,
      completedAt: null,
    });
    expect(String(created.uid)).toMatch(/^[0-9a-f-]{36}$/);
    expect((await open()).map((x) => x.title)).toEqual(['Buy milk']);
  });

  test('open tasks come soonest due first, undated last', async () => {
    await task({ title: 'Undated' });
    await task({ title: 'Friday evening', dueDate: '2026-11-27', dueTime: '18:00' });
    await task({ title: 'Friday', dueDate: '2026-11-27' });
    await task({ title: 'Monday', dueDate: '2026-11-23', priority: 3 });
    expect((await open()).map((x) => x.title)).toEqual(['Monday', 'Friday', 'Friday evening', 'Undated']);
  });

  test('due and repeat need a date, and bad input is a 400', async () => {
    const bad = [
      { title: 'x', dueTime: '09:00' },
      { title: 'x', rrule: 'FREQ=DAILY' },
      { title: 'x', dueDate: '2026-02-30' },
      { title: 'x', dueDate: '2026-11-27', dueTime: '24:00' },
      { title: 'x', priority: 4 },
      { title: '' },
      { title: 'x', tz: 'Mars/Olympus' },
      { title: 'x', rrule: 'FREQ=HOURLY', dueDate: '2026-11-27' },
      { title: 'x', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ];
    for (const body of bad) expect((await call('POST', '/tasks', { tz: 'UTC', ...body })).status).toBe(400);
    const id = String((await task({ title: 'x', dueDate: '2026-11-27', rrule: 'FREQ=DAILY' })).id);
    expect((await call('PATCH', `/tasks/${id}`, { dueDate: null })).status).toBe(400);
    expect((await call('PATCH', `/tasks/${id}`, { dueDate: null, rrule: null })).body.dueDate).toBeNull();
  });

  test('an empty change returns the task unchanged', async () => {
    const created = await task({ title: 'Same' });
    const res = await call('PATCH', `/tasks/${created.id}`, {});
    expect(res.status).toBe(200);
    expect(res.body as Json).toEqual(created);
  });

  test('tags are created by name, matched ignoring case, renamed and deleted', async () => {
    const a = await task({ title: 'a', tags: ['Errand', 'home', 'errand'] });
    expect(a.tags).toEqual(['Errand', 'home']);
    const b = await task({ title: 'b', tags: ['ERRAND'] });
    expect(b.tags).toEqual(['Errand']);
    const list = (await call('GET', '/tags')).body;
    expect(list.map((x) => x.name)).toEqual(['Errand', 'home']);
    const errand = String(list[0]?.id);
    const home = String(list[1]?.id);
    expect((await call('PATCH', `/tags/${errand}`, { name: 'HOME' })).status).toBe(400);
    expect((await call('PATCH', `/tags/${errand}`, { name: 'errands' })).body.name).toBe('errands');
    expect((await call('DELETE', `/tags/${home}`)).status).toBe(204);
    const after = await open();
    expect(after.find((x) => x.title === 'a')?.tags).toEqual(['errands']);
    expect((await call('PATCH', `/tasks/${a.id}`, { tags: [] })).body.tags).toEqual([]);
  });

  test('projects: unique names, and deleting one moves its tasks to the Inbox', async () => {
    const p = await call('POST', '/projects', { name: 'Home', color: '#669070' });
    expect(p.status).toBe(201);
    expect((await call('POST', '/projects', { name: 'home' })).status).toBe(400);
    expect((await call('POST', '/projects', { name: 'Work', color: 'red' })).status).toBe(400);
    const pid = String(p.body.id);
    expect((await call('PATCH', `/projects/${pid}`, {})).body.name).toBe('Home');
    expect((await call('PATCH', `/projects/${pid}`, { name: 'HOME', color: null })).body).toMatchObject({
      name: 'HOME',
      color: null,
    });
    const x = await task({ title: 'Fix the shelf', projectId: pid });
    expect(x.projectId).toBe(pid);
    expect((await call('DELETE', `/projects/${pid}`)).status).toBe(204);
    expect((await open())[0]?.projectId).toBeNull();
    expect((await call('POST', '/tasks', { title: 'x', tz: 'UTC', projectId: pid })).status).toBe(400);
  });

  test('subtasks are one level deep, follow their parent, and go when it is deleted', async () => {
    const pid = String((await call('POST', '/projects', { name: 'Trip' })).body.id);
    const parent = await task({ title: 'Pack', projectId: pid });
    const sub = await task({ title: 'Socks', parentId: parent.id });
    expect(sub).toMatchObject({ parentId: parent.id, projectId: pid });
    expect((await call('POST', '/tasks', { title: 'x', tz: 'UTC', parentId: sub.id })).status).toBe(400);
    expect((await call('PATCH', `/tasks/${parent.id}`, { parentId: sub.id })).status).toBe(400);
    expect((await call('PATCH', `/tasks/${parent.id}`, { parentId: parent.id })).status).toBe(400);
    // Moving the parent to the Inbox takes the subtask with it.
    await call('PATCH', `/tasks/${parent.id}`, { projectId: null });
    expect((await open()).find((x) => x.id === sub.id)?.projectId).toBeNull();
    // A subtask promoted to a task keeps the project it had.
    const loose = await call('PATCH', `/tasks/${sub.id}`, { parentId: null });
    expect(loose.body.parentId).toBeNull();
    await call('PATCH', `/tasks/${sub.id}`, { parentId: parent.id });
    expect((await call('DELETE', `/tasks/${parent.id}`)).status).toBe(204);
    expect(await open()).toEqual([]);
  });

  test('completing a task completes its subtasks; reopening a subtask reopens its parent', async () => {
    const parent = await task({ title: 'Pack' });
    const sub = await task({ title: 'Socks', parentId: parent.id });
    const done = await call('POST', `/tasks/${parent.id}/complete`);
    expect(done.body.completedAt).not.toBeNull();
    expect(await open()).toEqual([]);
    const completed = (await call('GET', '/tasks?completed=true')).body;
    expect(completed.map((x) => x.title).sort()).toEqual(['Pack', 'Socks']);
    // Completing twice changes nothing.
    expect((await call('POST', `/tasks/${parent.id}/complete`)).body.completedAt).toBe(done.body.completedAt);
    expect((await call('POST', `/tasks/${sub.id}/reopen`)).body.completedAt).toBeNull();
    expect((await open()).map((x) => x.title).sort()).toEqual(['Pack', 'Socks']);
  });

  test('a repeating task moves to its next due and its subtasks open again', async () => {
    const weekly = await task({ title: 'Bins', dueDate: '2026-11-23', rrule: 'FREQ=WEEKLY' });
    const sub = await task({ title: 'Recycling', parentId: weekly.id });
    await call('POST', `/tasks/${sub.id}/complete`);
    const moved = await completeTask(t.db, adaId, String(weekly.id), new Date('2026-11-23T12:00:00Z'));
    expect(moved).toMatchObject({ dueDate: '2026-11-30', completedAt: null });
    expect((await open()).find((x) => x.id === sub.id)?.completedAt).toBeNull();

    // Overdue by days: it lands on today in the task's zone, keeping its time.
    const daily = await task({ title: 'Pills', dueDate: '2026-11-18', dueTime: '08:00', rrule: 'FREQ=DAILY' });
    const caught = await completeTask(t.db, adaId, String(daily.id), new Date('2026-11-21T07:00:00Z'));
    expect(caught).toMatchObject({ dueDate: '2026-11-21', dueTime: '08:00:00', completedAt: null });

    // Once the rule ends, it completes for good.
    const once = await task({ title: 'Once', dueDate: '2026-11-21', rrule: 'FREQ=DAILY;COUNT=1' });
    expect((await call('POST', `/tasks/${once.id}/complete`)).body.completedAt).not.toBeNull();
  });

  test("another user's tasks, projects and tags are a 404 and never listed", async () => {
    const pid = String((await call('POST', '/projects', { name: 'Mine' })).body.id);
    const x = await task({ title: 'Secret', projectId: pid, tags: ['private'] });
    const tid = String((await call('GET', '/tags')).body[0]?.id);
    expect(await open(bob)).toEqual([]);
    expect((await call('GET', '/projects', undefined, bob)).body as unknown).toEqual([]);
    expect((await call('GET', '/tags', undefined, bob)).body as unknown).toEqual([]);
    expect((await call('PATCH', `/tasks/${x.id}`, { title: 'mine now' }, bob)).status).toBe(404);
    expect((await call('POST', `/tasks/${x.id}/complete`, undefined, bob)).status).toBe(404);
    expect((await call('POST', `/tasks/${x.id}/reopen`, undefined, bob)).status).toBe(404);
    expect((await call('DELETE', `/tasks/${x.id}`, undefined, bob)).status).toBe(404);
    expect((await call('PATCH', `/projects/${pid}`, { name: 'x' }, bob)).status).toBe(404);
    expect((await call('DELETE', `/projects/${pid}`, undefined, bob)).status).toBe(404);
    expect((await call('PATCH', `/tags/${tid}`, { name: 'x' }, bob)).status).toBe(404);
    expect((await call('DELETE', `/tags/${tid}`, undefined, bob)).status).toBe(404);
    // Bob can't file a task under Ada's project or task, and his own tag of the same name is separate.
    expect((await call('POST', '/tasks', { title: 'x', tz: 'UTC', projectId: pid }, bob)).status).toBe(400);
    expect((await call('POST', '/tasks', { title: 'x', tz: 'UTC', parentId: x.id }, bob)).status).toBe(400);
    expect((await task({ title: 'b', tags: ['Private'] }, bob)).tags).toEqual(['Private']);
    expect((await open())[0]?.tags).toEqual(['private']);
  });

  test('the export includes projects, tags and tasks', async () => {
    const pid = String((await call('POST', '/projects', { name: 'Home' })).body.id);
    await task({ title: 'Paint', projectId: pid, tags: ['diy'], dueDate: '2026-12-01' });
    const out = (await call('GET', '/export')).body;
    expect((out.projects as Json[]).map((p) => p.name)).toEqual(['Home']);
    expect((out.tags as Json[]).map((p) => p.name)).toEqual(['diy']);
    expect(out.tasks as Json[]).toMatchObject([
      { title: 'Paint', projectId: pid, tags: ['diy'], dueDate: '2026-12-01' },
    ]);
  });
});
