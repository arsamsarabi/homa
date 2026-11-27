import { describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ownCalendar, sharedCalendar } from '@/testing/calendars';
import { type FakeApi, json, renderApp, signedIn, signedInWith } from '@/testing/renderApp';

const calendars = [
  ownCalendar({ id: 'c1', name: 'Personal', color: '#4a4e69' }),
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
const today = new Date();
const at = (h: number): string => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h).toISOString();
const dentist = {
  eventId: 'e1',
  calendarId: 'c1',
  recurrenceId: at(15),
  start: at(15),
  end: at(16),
  summary: 'Dentist',
  description: null,
  location: 'High Street',
  allDay: false,
  tz: 'Europe/London',
  recurring: false,
  overridden: false,
};

const api =
  (occurrences: () => Response | Promise<Response>, user: FakeApi = signedIn) =>
  (url: URL, req: Request): Response | Promise<Response> => {
    if (url.pathname === '/api/calendars') return json(calendars);
    if (url.pathname === '/api/occurrences') return occurrences();
    return user(url, req);
  };

describe('calendar page', () => {
  test('shows a loader while events load', async () => {
    renderApp(
      '/?view=agenda',
      api(() => new Promise<Response>(() => {})),
    );
    expect(await screen.findByLabelText('Loading events')).toBeTruthy();
  });

  test('shows the error with a retry that loads the events', async () => {
    let calls = 0;
    renderApp(
      '/?view=agenda',
      api(() => (++calls === 1 ? json({ error: 'database is down' }, 500) : json([dentist]))),
    );
    expect(await screen.findByText("Couldn't load your events")).toBeTruthy();
    expect(screen.getByText('database is down')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dentist')).toBeTruthy();
  });

  test('lists the events in the agenda', async () => {
    renderApp(
      '/?view=agenda',
      api(() => json([dentist])),
    );
    expect(await screen.findByText('Dentist')).toBeTruthy();
    expect(screen.getByText('High Street')).toBeTruthy();
  });

  test('hiding a calendar from the filter announces success', async () => {
    const stamp = '2026-11-01T00:00:00Z';
    const [mine, holidays] = calendars;
    expect(mine).toBeDefined();
    expect(holidays).toBeDefined();
    const personal = { ...mine, hidden: false, updatedAt: stamp };
    renderApp('/?view=agenda', async (url, req) => {
      if (url.pathname === '/api/calendars' && req.method === 'GET') return json([personal, holidays]);
      if (url.pathname === '/api/calendars/c1' && req.method === 'PATCH') {
        const body = (await req.json()) as { hidden?: boolean };
        return json({ ...personal, ...body, updatedAt: stamp });
      }
      if (url.pathname === '/api/occurrences') return json([]);
      if (url.pathname === '/api/connections') return json([]);
      return signedIn(url, req);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Calendars' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Personal' }));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((el) => el.textContent?.includes('Personal hidden'))).toBe(true);
    });
  });

  test('the calendar filter names CalDAV accounts after their service', async () => {
    const hosts = [
      { id: 'k3', label: 'ada on dav.mailbox.org', service: 'mailbox.org' },
      { id: 'k4', label: 'ada on posteo.de', service: 'Posteo' },
      { id: 'k5', label: 'ada on calendar.zoho.eu', service: 'Zoho Calendar' },
    ];
    const stamp = '2026-11-02T00:00:00Z';
    const mine = hosts.map((h) =>
      ownCalendar({
        id: `c-${h.id}`,
        name: `${h.service} calendar`,
        color: '#336699',
        connectionId: h.id,
        createdAt: stamp,
        updatedAt: stamp,
      }),
    );
    const accounts = hosts.map((h) => ({
      id: h.id,
      provider: 'caldav',
      label: h.label,
      status: 'ok',
      lastError: null,
      lastSyncedAt: stamp,
      notice: null,
      noticeAt: null,
      createdAt: stamp,
      calendars: [],
    }));
    const fallback = api(() => json([]));
    renderApp('/?view=agenda', (url, req) => {
      if (url.pathname === '/api/calendars') return json(mine);
      if (url.pathname === '/api/connections') return json(accounts);
      return fallback(url, req);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Calendars' }));
    for (const h of hosts) {
      expect(
        await screen.findByRole('group', { name: (name) => name.startsWith(h.service), hidden: true }),
      ).toBeTruthy();
    }
  });

  test('a response that breaks the schema is an error, not a broken page', async () => {
    renderApp(
      '/?view=agenda',
      api(() => json([{ eventId: 'e1' }])),
    );
    expect(await screen.findByText("Couldn't load your events")).toBeTruthy();
  });

  test('the calendar filter groups shared calendars by owner', async () => {
    const bob = sharedCalendar({
      id: 'c-bob',
      name: 'Bob home',
      access: 'read',
      owner: { id: 'u2', name: 'Bob' },
    });
    const busy = {
      ...dentist,
      eventId: 'e-busy',
      calendarId: 'c-busy',
      summary: '',
      description: null,
      location: null,
    };
    const busyCal = sharedCalendar({
      id: 'c-busy',
      name: 'Bob work',
      access: 'freebusy',
      owner: { id: 'u2', name: 'Bob' },
      color: '#aa5500',
    });
    renderApp('/?view=agenda', async (url, req) => {
      if (url.pathname === '/api/calendars') return json([calendars[0], bob, busyCal]);
      if (url.pathname === '/api/occurrences') return json([busy]);
      if (url.pathname === '/api/connections') return json([]);
      return signedIn(url, req);
    });
    expect(await screen.findByText('Busy')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Calendars' }));
    expect(
      await screen.findByRole('group', { name: (name) => name.includes('Shared by Bob'), hidden: true }),
    ).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Bob home', hidden: true })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Bob work', hidden: true })).toBeTruthy();
  });

  test('the toolbar has no time zone control', async () => {
    renderApp('/', signedInWith({ homeTz: 'Europe/London', secondaryCalendar: 'none' }));
    await screen.findByRole('button', { name: 'Today' });
    expect(screen.queryByLabelText(/time zone/i)).toBeNull();
  });

  test('shows times in the home zone, ignoring any tz in the URL', async () => {
    // 10:00 UTC on 19 November 2026: 13:30 in Tehran (not 05:00 New York).
    const meeting = {
      ...dentist,
      start: '2026-11-19T10:00:00Z',
      end: '2026-11-19T11:00:00Z',
      recurrenceId: '2026-11-19T10:00:00Z',
    };
    const tehran = signedInWith({ homeTz: 'Asia/Tehran', secondaryCalendar: 'none' });
    renderApp(
      '/?view=agenda&date=2026-11-19&tz=America/New_York',
      api(() => json([meeting]), tehran),
    );
    expect(await screen.findByText(/13:30/)).toBeTruthy();
    expect(screen.queryByText(/\b0?5:00/)).toBeNull();
  });

  test('the week starts on the day chosen in settings', async () => {
    const sunday = signedInWith({ homeTz: 'Europe/London', secondaryCalendar: 'none', weekStart: 0 });
    renderApp(
      '/?view=week&date=2026-11-19',
      api(() => json([]), sunday),
    );
    const week = await screen.findByRole('region', { name: /^Week$/ });
    await waitFor(() => expect(week.textContent).toMatch(/^Sun 15.*Sat 21/));
  });

  test('shows Jalali dates and Persian occasions when that calendar is on', async () => {
    const yalda = {
      ...dentist,
      start: '2026-12-21T08:00:00Z',
      end: '2026-12-21T09:00:00Z',
      recurrenceId: '2026-12-21T08:00:00Z',
    };
    const jalali = signedInWith({ homeTz: 'Asia/Tehran', secondaryCalendar: 'jalali' });
    renderApp(
      '/?view=agenda&date=2026-12-21',
      api(() => json([yalda]), jalali),
    );
    expect(await screen.findByText('Yalda Night')).toBeTruthy();
    expect(screen.getByText('30 Azar')).toBeTruthy();
  });

  test("a subscription's event opens as details, not a form", async () => {
    const holiday = { ...dentist, eventId: 'e2', calendarId: 'c2', summary: 'Bank holiday', location: null };
    renderApp(
      '/?view=agenda',
      api(() => json([dentist, holiday])),
    );
    fireEvent.click(await screen.findByText('Bank holiday'));
    const details = await screen.findByRole('dialog', { name: 'Edit event' });
    expect(details.textContent).toContain("This event is from a read-only calendar and can't be changed here.");
    expect(details.textContent).toContain('UK holidays');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('letter keys switch the view', async () => {
    renderApp(
      '/?view=week',
      api(() => json([dentist])),
    );
    expect(await screen.findByRole('region', { name: 'Week' })).toBeTruthy();
    fireEvent.keyDown(document.documentElement, { key: 'm', code: 'KeyM' });
    expect(await screen.findByRole('region', { name: 'Month' })).toBeTruthy();
  });

  test('shortcut hints sit beside the buttons, unless turned off in settings', async () => {
    renderApp(
      '/?view=week',
      api(() => json([])),
    );
    const newEvent = await screen.findByRole('button', { name: /New event/ });
    await waitFor(() => expect(newEvent.querySelector('kbd')?.textContent).toBe('C'));
    expect(screen.getByRole('button', { name: /Today/ }).querySelector('kbd')?.textContent).toBe('T');
    cleanup();

    const off = signedInWith({ homeTz: 'Europe/London', secondaryCalendar: 'none', showShortcutHints: false });
    renderApp(
      '/?view=week',
      api(() => json([]), off),
    );
    const plain = await screen.findByRole('button', { name: /New event/ });
    expect(plain.querySelector('kbd')).toBeNull();
  });

  test('work week shows five weekdays and is in the view menu', async () => {
    renderApp(
      '/?view=workWeek&date=2026-11-19',
      api(() => json([])),
    );
    const week = await screen.findByRole('region', { name: /^Work week$/ });
    await waitFor(() => expect(week.textContent).toMatch(/Mon 16/));
    expect(week.textContent).toMatch(/Fri 20/);
    expect(week.textContent ?? '').not.toMatch(/Sat /);
    expect(screen.getByRole('combobox', { name: 'View' })).toBeTruthy();
  });

  test('previous and next sit around the date title and step the week', async () => {
    renderApp(
      '/?view=week&date=2026-11-19',
      api(() => json([])),
    );
    const week = await screen.findByRole('region', { name: /^Week$/ });
    await waitFor(() => expect(week.textContent).toMatch(/Mon 16/));
    expect(screen.getByRole('button', { name: 'Previous' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(week.textContent).toMatch(/Mon 9/));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(week.textContent).toMatch(/Mon 16/));
  });
});
