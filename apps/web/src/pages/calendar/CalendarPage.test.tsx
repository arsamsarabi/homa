import { describe, expect, test } from 'bun:test';
import { fireEvent, screen } from '@testing-library/react';
import { json, renderApp, signedIn } from '@/testing/renderApp';

const calendars = [
  {
    id: 'c1',
    name: 'Personal',
    color: '#4a4e69',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
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
  (occurrences: () => Response | Promise<Response>) =>
  (url: URL, req: Request): Response | Promise<Response> => {
    if (url.pathname === '/api/calendars') return json(calendars);
    if (url.pathname === '/api/occurrences') return occurrences();
    return signedIn(url, req);
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
});
