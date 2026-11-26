import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type FakeApi, json, renderApp, signedIn, signedInWith } from '@/testing/renderApp';

const calendars = [
  {
    id: 'c1',
    name: 'Personal',
    color: '#4a4e69',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    id: 'c2',
    name: 'UK holidays',
    color: '#336699',
    connectionId: 'k1',
    readOnly: true,
    createdAt: '2026-11-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  },
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

  test('the calendar filter names CalDAV accounts after their service', async () => {
    const hosts = [
      { id: 'k3', label: 'ada on dav.mailbox.org', service: 'mailbox.org' },
      { id: 'k4', label: 'ada on posteo.de', service: 'Posteo' },
      { id: 'k5', label: 'ada on calendar.zoho.eu', service: 'Zoho Calendar' },
    ];
    const stamp = '2026-11-02T00:00:00Z';
    const mine = hosts.map((h) => ({
      id: `c-${h.id}`,
      name: `${h.service} calendar`,
      color: '#336699',
      connectionId: h.id,
      createdAt: stamp,
      updatedAt: stamp,
    }));
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

  test('shows times in the home zone, or the zone in the URL', async () => {
    // 10:00 UTC on 19 November 2026: 13:30 in Tehran, 05:00 in New York.
    const meeting = {
      ...dentist,
      start: '2026-11-19T10:00:00Z',
      end: '2026-11-19T11:00:00Z',
      recurrenceId: '2026-11-19T10:00:00Z',
    };
    const tehran = signedInWith({ homeTz: 'Asia/Tehran', secondaryCalendar: 'none' });
    const first = renderApp(
      '/?view=agenda&date=2026-11-19',
      api(() => json([meeting]), tehran),
    );
    expect(await screen.findByText(/13:30/)).toBeTruthy();
    first.unmount();

    renderApp(
      '/?view=agenda&date=2026-11-19&tz=America/New_York',
      api(() => json([meeting]), tehran),
    );
    expect(await screen.findByText(/\b0?5:00/)).toBeTruthy();
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
