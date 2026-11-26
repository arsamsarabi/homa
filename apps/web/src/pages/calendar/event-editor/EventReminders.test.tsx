// Reminders on a read-only calendar's event save at once (they stay in Homa). The editable form
// needs document.fonts (Mantine's Textarea), which happy-dom lacks: e2e/reminders.spec.ts covers it.
import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, renderApp, signedIn } from '@/testing/renderApp';

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
const occurrence = (eventId: string, calendarId: string, summary: string) => ({
  eventId,
  calendarId,
  recurrenceId: at(15),
  start: at(15),
  end: at(16),
  summary,
  description: null,
  location: null,
  allDay: false,
  tz: 'UTC',
  recurring: false,
  overridden: false,
});
const event = (id: string, calendarId: string, summary: string, reminders: number[]) => ({
  id,
  calendarId,
  uid: `${id}@homa`,
  summary,
  description: null,
  location: null,
  start: at(15),
  end: at(16),
  allDay: false,
  tz: 'UTC',
  rrule: null,
  exdates: [],
  rdates: [],
  reminders,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
});

describe('event reminders', () => {
  test('a read-only event saves its reminders at once', async () => {
    const sent: unknown[] = [];
    renderApp('/?view=agenda', async (url, req) => {
      if (url.pathname === '/api/calendars') return json(calendars);
      if (url.pathname === '/api/occurrences') return json([occurrence('e2', 'c2', 'Bank holiday')]);
      if (url.pathname === '/api/events/e2') return json(event('e2', 'c2', 'Bank holiday', []));
      if (url.pathname === '/api/events/e2/reminders') {
        const body = (await req.json()) as { reminders: number[] };
        sent.push(body);
        return json(event('e2', 'c2', 'Bank holiday', body.reminders));
      }
      return signedIn(url, req);
    });
    fireEvent.click(await screen.findByText('Bank holiday'));
    const details = await screen.findByRole('dialog', { name: 'Edit event' });
    const add = (): HTMLButtonElement => within(details).getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    await waitFor(() => expect(add().disabled).toBe(false));
    fireEvent.change(within(details).getByLabelText('Amount'), { target: { value: '1' } });
    fireEvent.change(within(details).getByLabelText('Unit'), { target: { value: 'days' } });
    fireEvent.click(add());
    await waitFor(() => expect(sent).toEqual([{ reminders: [1440] }]));
    expect(within(details).getByRole('button', { name: 'Remove 1 day before' })).toBeTruthy();
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((el) => el.textContent?.includes('Reminder saved'))).toBe(true);
    });
  });
});
