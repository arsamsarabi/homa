import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Task } from '@/schemas';
import { addDays, isoDate, today } from '@/services/dates';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const TZ = 'Europe/London';
const TODAY = isoDate(today(TZ));
const day = (n: number): string => isoDate(addDays(new Date(`${TODAY}T00:00:00Z`), n));
const task = (title: string, extra: Partial<Task> = {}): Task => ({
  id: title.replaceAll(' ', '-'),
  uid: title,
  title,
  notes: null,
  projectId: null,
  parentId: null,
  tags: [],
  priority: 0,
  dueDate: null,
  dueTime: null,
  tz: TZ,
  rrule: null,
  reminders: [],
  block: null,
  completedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...extra,
});

type Sent = { method: string; path: string; body: unknown };

/** A tasks API over an in-memory list; records every write. */
function fakeTasks(start: Task[], secondaryCalendar = 'none') {
  let list = start;
  const sent: Sent[] = [];
  const user = signedInWith({ homeTz: TZ, secondaryCalendar });
  const api = async (url: URL, req: Request): Promise<Response> => {
    const p = url.pathname;
    if (p === '/api/projects')
      return json([{ id: 'p1', name: 'Garden', color: '#669070', createdAt: '2026-11-01T00:00:00Z' }]);
    if (p === '/api/tags') return json([{ id: 'g1', name: 'errand' }]);
    if (p === '/api/calendars')
      return json([
        {
          id: 'c1',
          name: 'Personal',
          color: '#7d7fa3',
          connectionId: null,
          readOnly: false,
          hidden: false,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ]);
    if (!p.startsWith('/api/tasks')) return user(url, req);
    if (req.method === 'GET')
      return json(
        url.searchParams.get('completed') ? list.filter((t) => t.completedAt) : list.filter((t) => !t.completedAt),
      );
    const body = req.method === 'DELETE' ? undefined : await req.json().catch(() => undefined);
    sent.push({ method: req.method, path: p, body });
    const id = decodeURIComponent(p.split('/')[3] ?? '');
    if (req.method === 'POST' && p === '/api/tasks') {
      const created = task(`new${list.length}`, body as Partial<Task>);
      list = [...list, created];
      return json(created, 201);
    }
    if (p.endsWith('/block')) {
      const b = body as { calendarId: string; start: string; end: string };
      list = list.map((t) => (t.id === id ? { ...t, block: { eventId: 'e1', ...b } } : t));
      return json(list.find((t) => t.id === id));
    }
    if (p.endsWith('/complete')) {
      list = list.map((t) => (t.id === id ? { ...t, completedAt: '2026-11-21T10:00:00Z' } : t));
      return json(list.find((t) => t.id === id));
    }
    if (req.method === 'PATCH') {
      list = list.map((t) => (t.id === id ? { ...t, ...(body as Partial<Task>) } : t));
      return json(list.find((t) => t.id === id));
    }
    return json({ error: 'unexpected' }, 404);
  };
  return { api, sent };
}

describe('tasks page', () => {
  test('Today lists late tasks, then today, and quick add makes a task due today', async () => {
    const { api, sent } = fakeTasks([
      task('Pay the bill', { dueDate: day(-2) }),
      task('Buy milk', { dueDate: TODAY, tags: ['errand'], priority: 3 }),
      task('Later', { dueDate: day(5) }),
    ]);
    renderApp('/tasks', api);
    const main = await screen.findByRole('region', { name: 'Today' });
    await within(main).findByText('Buy milk');
    expect(within(main).getByRole('heading', { name: 'Overdue' })).toBeTruthy();
    expect(within(main).getByText('Pay the bill')).toBeTruthy();
    expect(within(main).queryByText('Later')).toBeNull();
    expect(within(main).getByText('High priority')).toBeTruthy();
    expect(within(main).getByText('#errand')).toBeTruthy();
    // Inbox and Today counts in the nav.
    const nav = screen.getByRole('navigation', { name: 'Task lists' });
    expect(within(nav).getByRole('link', { name: /Today/ }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByLabelText('2 tasks')).toBeTruthy();

    fireEvent.change(within(main).getByRole('textbox', { name: 'Add a task' }), { target: { value: 'Call the bank' } });
    fireEvent.submit(within(main).getByRole('textbox', { name: 'Add a task' }));
    await waitFor(() =>
      expect(sent[0]).toEqual({
        method: 'POST',
        path: '/api/tasks',
        body: { title: 'Call the bank', tz: TZ, dueDate: TODAY },
      }),
    );
    expect(await within(main).findByText('Call the bank')).toBeTruthy();

    fireEvent.click(within(main).getByRole('checkbox', { name: 'Complete "Buy milk"' }));
    await waitFor(() => expect(sent[1]).toMatchObject({ method: 'POST', path: '/api/tasks/Buy-milk/complete' }));
    await waitFor(() => expect(within(main).queryByText('Buy milk')).toBeNull());
  });

  test('quick add reads a date from the line and shows it before adding', async () => {
    const { api, sent } = fakeTasks([]);
    renderApp('/tasks?list=inbox', api);
    const main = await screen.findByRole('region', { name: 'Inbox' });
    expect(await within(main).findByText(/Your Inbox is empty/)).toBeTruthy();
    const input = within(main).getByRole('textbox', { name: 'Add a task' });
    fireEvent.change(input, { target: { value: 'Buy stamps tomorrow' } });
    expect(within(main).getByText('Due Tomorrow')).toBeTruthy();
    fireEvent.submit(input);
    await waitFor(() =>
      expect(sent[0]?.body).toEqual({ title: 'Buy stamps', tz: TZ, dueDate: day(1), dueTime: null, rrule: null }),
    );
  });

  test('Upcoming groups by day with the Solar Hijri date; a project nests subtasks', async () => {
    const { api } = fakeTasks(
      [
        task('Plant bulbs', { dueDate: day(3), projectId: 'p1' }),
        task('Buy compost', { parentId: 'Plant-bulbs', projectId: 'p1', dueDate: day(3) }),
      ],
      'jalali',
    );
    const { unmount } = renderApp('/tasks?list=upcoming', api);
    const main = await screen.findByRole('region', { name: 'Upcoming' });
    await within(main).findByText('Plant bulbs');
    // The heading has the Gregorian and the Solar Hijri dates.
    expect(within(main).getByRole('heading', { level: 2 }).textContent).toMatch(/\(.+\)/);
    expect(within(main).getByText('Garden')).toBeTruthy();
    expect(within(main).getByText('In Plant bulbs')).toBeTruthy();
    unmount();

    renderApp('/tasks?project=p1', api);
    const project = await screen.findByRole('region', { name: 'Garden' });
    const parent = (await within(project).findByText('Plant bulbs')).closest('li');
    expect(parent && within(parent).getByText('Buy compost')).toBeTruthy();
  });

  test('the drawer saves a changed task', async () => {
    const { api, sent } = fakeTasks([task('Mow', { dueDate: TODAY })]);
    renderApp('/tasks', api);
    fireEvent.click(await screen.findByRole('button', { name: /Mow/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit task' });
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Task' }), { target: { value: 'Mow the lawn' } });
    fireEvent.change(within(drawer).getByLabelText('Time'), { target: { value: '17:30' } });
    fireEvent.change(within(drawer).getByRole('combobox', { name: 'Repeat' }), { target: { value: 'weekly' } });
    fireEvent.change(within(drawer).getByRole('combobox', { name: 'Project' }), { target: { value: 'p1' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent[0]).toEqual({
        method: 'PATCH',
        path: '/api/tasks/Mow',
        body: {
          title: 'Mow the lawn',
          notes: null,
          projectId: 'p1',
          priority: 0,
          tags: [],
          dueDate: TODAY,
          dueTime: '17:30',
          rrule: 'FREQ=WEEKLY',
          reminders: [],
        },
      }),
    );
  });

  test('the drawer sets reminders and blocks time on the calendar', async () => {
    const { api, sent } = fakeTasks([task('Report', { dueDate: '2030-07-01', dueTime: '15:00' })]);
    renderApp('/tasks?list=upcoming', api);
    fireEvent.click(await screen.findByRole('button', { name: /Report/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit task' });
    fireEvent.change(within(drawer).getByLabelText('Amount'), { target: { value: '1' } });
    fireEvent.change(within(drawer).getByLabelText('Unit'), { target: { value: 'hours' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Add' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent[0]?.body).toMatchObject({ reminders: [60] }));

    fireEvent.click(await screen.findByRole('button', { name: /Report/ }));
    const again = await screen.findByRole('dialog', { name: 'Edit task' });
    // The block starts at the due time; 2 hours on the only writable calendar.
    expect((within(again).getByLabelText('Starts') as HTMLInputElement).value).toBe('15:00');
    fireEvent.change(within(again).getByRole('combobox', { name: 'Length' }), { target: { value: '120' } });
    await waitFor(() =>
      expect((within(again).getByRole('combobox', { name: 'Calendar' }) as HTMLSelectElement).value).toBe('c1'),
    );
    fireEvent.click(within(again).getByRole('button', { name: 'Block time' }));
    await waitFor(() =>
      expect(sent[1]).toEqual({
        method: 'PUT',
        path: '/api/tasks/Report/block',
        // 15:00 BST is 14:00Z.
        body: { calendarId: 'c1', start: '2030-07-01T14:00:00.000Z', end: '2030-07-01T16:00:00.000Z' },
      }),
    );
    expect(await within(again).findByRole('button', { name: 'Move the block' })).toBeTruthy();
  });

  test('a failed load shows why, with a retry', async () => {
    const user = signedInWith({ homeTz: TZ, secondaryCalendar: 'none' });
    renderApp('/tasks', (url, req) =>
      url.pathname === '/api/tasks'
        ? json({ error: 'database is down' }, 500)
        : url.pathname === '/api/projects' || url.pathname === '/api/tags'
          ? json([])
          : user(url, req),
    );
    expect(await screen.findByText("Couldn't load your tasks")).toBeTruthy();
    expect(screen.getByText('database is down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  test('an unknown project says so', async () => {
    const { api } = fakeTasks([]);
    renderApp('/tasks?project=gone', api);
    expect(await screen.findByText('This project or tag no longer exists.')).toBeTruthy();
  });
});
