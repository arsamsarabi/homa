import { describe, expect, test } from 'bun:test';
import { focusManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Notification } from '@/schemas';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const user = signedInWith({ homeTz: 'UTC', secondaryCalendar: 'none' });
const standup: Notification = {
  id: 'n1',
  kind: 'event',
  title: 'Stand-up',
  start: '2026-11-20T09:00:00Z',
  allDay: false,
  eventId: 'e1',
  taskId: null,
  pollId: null,
  recurrenceId: '2026-11-20T09:00:00Z',
  fireAt: '2026-11-20T08:50:00Z',
  read: false,
};
const pills: Notification = {
  ...standup,
  id: 'n2',
  kind: 'standalone',
  title: 'Pills',
  eventId: null,
  recurrenceId: null,
  read: true,
};

type Sent = { path: string; body: unknown };

/** The app on Settings with these notifications; posts are recorded and answered like the API. */
function app(state: { items: Notification[]; unread: number }, sent: Sent[], seen: URL[] = []) {
  renderApp('/settings', async (url, req) => {
    seen.push(url);
    if (url.pathname === '/api/notifications') return json(state);
    if (url.pathname.startsWith('/api/notifications/') && req.method === 'POST') {
      const body = req.headers.get('content-type')?.includes('json') ? await req.json().catch(() => null) : null;
      sent.push({ path: url.pathname, body });
      if (url.pathname === '/api/notifications/read') {
        state.unread = 0;
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/api/notifications/clear') {
        state.items = [];
        return new Response(null, { status: 204 });
      }
      const id = url.pathname.split('/')[3];
      state.items = state.items.filter((n) => n.id !== id);
      return json({ ...standup, id });
    }
    return user(url, req);
  });
}

const openPanel = async (name: string): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Notifications' });
};

describe('notification bell', () => {
  test('groups new and earlier, keeps the new mark while open, and snoozes and marks done', async () => {
    const sent: Sent[] = [];
    app({ items: [standup, pills], unread: 1 }, sent);
    const panel = await openPanel('Notifications, 1 unread');
    await waitFor(() => expect(sent[0]?.path).toBe('/api/notifications/read'));
    // Focus lands on the heading, so no button lights up with a focus ring on open.
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Notifications'));
    // Read on the server, but still marked new here until the panel closes.
    const fresh = within(panel).getByRole('region', { name: 'New' });
    expect(within(fresh).getByText('Stand-up')).toBeTruthy();
    expect(within(fresh).getByText(/^Starts .* · /)).toBeTruthy();
    expect(within(within(panel).getByRole('region', { name: 'Earlier' })).getByText('Pills')).toBeTruthy();

    fireEvent.click(within(panel).getByRole('button', { name: 'Snooze "Stand-up"' }));
    fireEvent.click(await within(panel).findByRole('menuitem', { name: '30 minutes' }));
    await waitFor(() => expect(sent[1]?.path).toBe('/api/notifications/n1/snooze'));
    const until = new Date((sent[1]?.body as { until: string } | undefined)?.until ?? 0).getTime();
    expect(Math.abs(until - Date.now() - 30 * 60_000)).toBeLessThan(60_000);

    fireEvent.click(within(panel).getByRole('button', { name: 'Mark "Pills" done' }));
    await waitFor(() => expect(sent[2]?.path).toBe('/api/notifications/n2/done'));
    expect(await within(panel).findByText("You're all caught up")).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Clear all' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  test('a task is completed from its notification, and Clear all empties the panel', async () => {
    const sent: Sent[] = [];
    const rent: Notification = { ...standup, id: 'n3', kind: 'task', title: 'Pay rent', eventId: null, taskId: 't1' };
    app({ items: [rent, pills], unread: 0 }, sent);
    const panel = await openPanel('Notifications');
    expect(await within(panel).findByRole('button', { name: 'Complete "Pay rent"' })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(sent).toEqual([{ path: '/api/notifications/clear', body: null }]));
    expect(await within(panel).findByText("You're all caught up")).toBeTruthy();
  });

  test("clicking an event's notification opens its day in the calendar", async () => {
    const seen: URL[] = [];
    app({ items: [standup], unread: 0 }, [], seen);
    const panel = await openPanel('Notifications');
    await within(panel).findByText('Stand-up');
    fireEvent.click(await within(panel).findByRole('button', { name: /Stand-up.*Starts/ }));
    // The calendar loads that day (a cheap check: role queries over the whole calendar are slow).
    await waitFor(() =>
      expect(seen.some((u) => u.pathname !== '/api/notifications' && u.search.includes('2026-11-20'))).toBe(true),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('a reminder that fires while the app is open shows a toast', async () => {
    const state: { items: Notification[]; unread: number } = { items: [pills], unread: 0 };
    app(state, []);
    await screen.findByRole('button', { name: 'Notifications' });
    await waitFor(() => expect(screen.queryByText('Stand-up')).toBeNull());
    state.items = [standup, pills];
    state.unread = 1;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByText('Stand-up')).toBeTruthy();
    expect(screen.queryByText('Pills')).toBeNull(); // only the new one
    focusManager.setFocused(undefined);
  });

  test('a failed load shows why, with a retry', async () => {
    renderApp('/settings', (url, req) =>
      url.pathname === '/api/notifications' ? json({ error: 'database is down' }, 500) : user(url, req),
    );
    const panel = await openPanel('Notifications');
    expect(await within(panel).findByText("Couldn't load notifications: database is down")).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
