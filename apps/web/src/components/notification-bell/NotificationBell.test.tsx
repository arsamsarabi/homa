import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const user = signedInWith({ homeTz: 'UTC', secondaryCalendar: 'none' });
const standup = {
  id: 'n1',
  kind: 'event',
  title: 'Stand-up',
  start: '2026-11-20T09:00:00Z',
  allDay: false,
  eventId: 'e1',
  recurrenceId: '2026-11-20T09:00:00Z',
  fireAt: '2026-11-20T08:50:00Z',
  read: false,
};
const pills = { ...standup, id: 'n2', kind: 'standalone', title: 'Pills', eventId: null, recurrenceId: null };

describe('notification bell', () => {
  test('shows the unread count, lists notifications, and snoozes and marks them done', async () => {
    const sent: { path: string; body: unknown }[] = [];
    let items = [standup, pills];
    let unread = 2;
    renderApp('/settings', async (url, req) => {
      if (url.pathname === '/api/notifications') return json({ items, unread });
      if (url.pathname.startsWith('/api/notifications/') && req.method === 'POST') {
        const body = req.headers.get('content-type')?.includes('json') ? await req.json().catch(() => null) : null;
        sent.push({ path: url.pathname, body });
        if (url.pathname === '/api/notifications/read') {
          unread = 0;
          return new Response(null, { status: 204 });
        }
        const id = url.pathname.split('/')[3];
        items = items.filter((n) => n.id !== id);
        return json({ ...standup, id });
      }
      return user(url, req);
    });
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    fireEvent.click(bell);
    const drawer = await screen.findByRole('dialog', { name: 'Notifications' });
    await waitFor(() => expect(sent[0]?.path).toBe('/api/notifications/read'));
    expect(within(drawer).getByText('Stand-up')).toBeTruthy();
    expect(within(drawer).getByText('Pills')).toBeTruthy();

    fireEvent.change(within(drawer).getByRole('combobox', { name: 'Snooze "Stand-up"' }), { target: { value: '30' } });
    await waitFor(() => expect(sent[1]?.path).toBe('/api/notifications/n1/snooze'));
    const until = new Date((sent[1]?.body as { until: string } | undefined)?.until ?? 0).getTime();
    expect(Math.abs(until - Date.now() - 30 * 60_000)).toBeLessThan(60_000);

    fireEvent.click(within(drawer).getByRole('button', { name: 'Mark "Pills" done' }));
    await waitFor(() => expect(sent[2]?.path).toBe('/api/notifications/n2/done'));
    expect(await within(drawer).findByText('Nothing to remind you of right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  test('a failed load shows why, with a retry', async () => {
    renderApp('/settings', (url, req) =>
      url.pathname === '/api/notifications' ? json({ error: 'database is down' }, 500) : user(url, req),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const drawer = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(await within(drawer).findByText("Couldn't load notifications: database is down")).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
