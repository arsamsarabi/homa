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
});
