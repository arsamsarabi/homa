import { beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLastCalendar } from '@/stores';
import { ownCalendar } from '@/testing/calendars';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const calendars = [
  ownCalendar({ id: 'c1', name: 'Personal', color: '#4a4e69' }),
  ownCalendar({ id: 'c3', name: 'Work', color: '#22577a' }),
  ownCalendar({
    id: 'c2',
    name: 'UK holidays',
    color: '#336699',
    connectionId: 'k1',
    readOnly: true,
    createdAt: '2026-11-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  }),
];

type Posted = Record<string, unknown>;

/** The calendar API with a home zone of London; POST /api/events answers with `create`. */
function fakeApi(posted: Posted[], create: (body: Posted) => Response = (b) => json(created(b), 201)) {
  const user = signedInWith({ homeTz: 'Europe/London', secondaryCalendar: 'none' });
  return async (url: URL, req: Request): Promise<Response> => {
    if (url.pathname === '/api/calendars') return json(calendars);
    if (url.pathname === '/api/occurrences') return json([]);
    if (url.pathname === '/api/events' && req.method === 'POST') {
      const body = (await req.json()) as Posted;
      posted.push(body);
      return create(body);
    }
    return user(url, req);
  };
}

const created = (b: Posted): Posted => ({
  ...b,
  id: 'e9',
  uid: 'u9',
  exdates: [],
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
});

const input = (): Promise<HTMLInputElement> => screen.findByRole('textbox', { name: 'Quick add' });
const preview = (): HTMLElement => screen.getByTestId('quick-add-preview');

describe('quick add', () => {
  beforeEach(() => useLastCalendar.setState({ id: undefined }));

  test('shows what it will create as you type, and Enter creates it', async () => {
    const posted: Posted[] = [];
    renderApp('/?view=agenda', fakeApi(posted));
    const box = await input();
    fireEvent.change(box, { target: { value: 'Dentist 23 Dec 2027 3pm 45m' } });
    await waitFor(() => expect(preview().textContent).toContain('Personal'));
    expect(preview().textContent).toContain('Dentist');
    expect(preview().textContent).toContain('Thu 23 Dec');
    expect(preview().textContent).toMatch(/15:00\s*–\s*15:45/);
    expect(preview().textContent).toContain('45 min');
    expect(preview().textContent).toContain('Personal');
    // The preview is the field's description.
    const described = document.getElementById(box.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toContain('Dentist');

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      summary: 'Dentist',
      description: null,
      location: null,
      start: '2027-12-23T15:00:00.000Z',
      end: '2027-12-23T15:45:00.000Z',
      calendarId: 'c1',
      allDay: false,
      tz: 'Europe/London',
      rrule: null,
    });
    await waitFor(() => expect(box.value).toBe(''));
    expect(screen.queryByTestId('quick-add-preview')).toBeNull();
  });

  test('creates repeating and all-day events', async () => {
    const posted: Posted[] = [];
    renderApp('/?view=agenda', fakeApi(posted));
    const box = await input();
    fireEvent.change(box, { target: { value: 'Holiday 3-7 Dec 2027 yearly' } });
    await waitFor(() => expect(preview().textContent).toContain('Personal'));
    expect(preview().textContent).toContain('Every year');
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      summary: 'Holiday',
      allDay: true,
      tz: 'UTC',
      start: '2027-12-03T00:00:00.000Z',
      end: '2027-12-08T00:00:00.000Z',
      rrule: 'FREQ=YEARLY',
    });
  });

  test('says when it found no date, and uses the next hour', async () => {
    renderApp('/?view=agenda', fakeApi([]));
    const box = await input();
    fireEvent.change(box, { target: { value: 'buy milk' } });
    expect(preview().textContent).toContain('No date found: the next hour');
    expect(preview().textContent).toContain('buy milk');
  });

  test('Shift+Enter opens the editor filled in, without creating anything', async () => {
    const posted: Posted[] = [];
    renderApp('/?view=agenda', fakeApi(posted));
    const box = await input();
    fireEvent.change(box, { target: { value: 'Team sync every Monday 10am' } });
    await waitFor(() => expect(preview().textContent).toContain('Personal'));
    expect(preview().textContent).toContain('Every week');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Team sync');
    expect(dialog.querySelector<HTMLInputElement>('input[name="start"]')?.value).toMatch(/T10:00$/);
    expect(dialog.textContent).toContain('Personal');
    expect(within(dialog).getByRole('button', { name: 'Repeat' }).textContent).toBe('Every week');
    expect(box.value).toBe('');
    expect(posted).toHaveLength(0);
  });

  test('"More options" opens the editor too', async () => {
    renderApp('/?view=agenda', fakeApi([]));
    const box = await input();
    const more = screen.getByRole('button', { name: 'More options' });
    expect(more.hasAttribute('disabled')).toBe(true);
    fireEvent.change(box, { target: { value: 'Lunch with Sara tomorrow 1-2pm' } });
    fireEvent.click(more);
    await screen.findByRole('dialog', { name: 'New event' });
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Lunch with Sara');
  });

  test('a failed create keeps the text and shows why', async () => {
    renderApp(
      '/?view=agenda',
      fakeApi([], () => json({ error: 'Calendar is full' }, 400)),
    );
    const box = await input();
    fireEvent.change(box, { target: { value: 'Dentist tomorrow 3pm' } });
    await waitFor(() => expect(preview().textContent).toContain('Personal'));
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('Calendar is full')).toBeTruthy();

    expect(box.value).toBe('Dentist tomorrow 3pm');
  });

  test('new events go in the calendar last used', async () => {
    useLastCalendar.setState({ id: 'c3' });
    const posted: Posted[] = [];
    renderApp('/?view=agenda', fakeApi(posted));
    const box = await input();
    fireEvent.change(box, { target: { value: 'Standup tomorrow 9:30' } });
    await waitFor(() => expect(preview().textContent).toContain('Work'));
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(posted[0]?.calendarId).toBe('c3'));
  });

  test('Escape clears the line, and Q focuses it', async () => {
    renderApp('/?view=agenda', fakeApi([]));
    const box = await input();
    fireEvent.keyDown(document.documentElement, { key: 'q', code: 'KeyQ' });
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: 'call mum in 2 hours' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('');
  });
});
