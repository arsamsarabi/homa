// The add and edit drawer is covered in e2e/channels.spec.ts: closing a drawer on the Settings page
// stalls happy-dom.
import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, within } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const user = signedInWith({ homeTz: 'UTC', secondaryCalendar: 'none' });
const channel = (over: Record<string, unknown> = {}) => ({
  id: 'ch1',
  kind: 'ntfy',
  name: 'Phone',
  enabled: true,
  reminderKinds: ['event', 'standalone', 'task'],
  server: 'https://ntfy.sh/',
  topic: 'ada-123',
  host: null,
  hasToken: false,
  failing: false,
  lastError: null,
  lastErrorAt: null,
  lastSentAt: null,
  createdAt: '2026-11-20T00:00:00Z',
  ...over,
});

describe('notification channels', () => {
  test('a failing channel shows its error; send test reports the result', async () => {
    const tested: string[] = [];
    renderApp('/settings', (url, req) => {
      if (url.pathname === '/api/notification-channels')
        return json({ items: [channel({ failing: true, lastError: 'ntfy.sh answered 503' })], email: true });
      if (url.pathname === '/api/notification-channels/ch1/test' && req.method === 'POST') {
        tested.push(url.pathname);
        return json({ ok: false, error: 'ntfy.sh answered 503' });
      }
      return user(url, req);
    });
    const list = await screen.findByRole('list', { name: 'Notification channels' });
    expect(within(list).getByText('Failing')).toBeTruthy();
    expect(within(list).getByText('Last error: ntfy.sh answered 503')).toBeTruthy();
    expect(list.textContent).toContain('All reminders');
    fireEvent.click(within(list).getByRole('button', { name: 'Send a test to "Phone"' }));
    expect(await within(list).findByText("The test didn't go through: ntfy.sh answered 503")).toBeTruthy();
    expect(tested).toHaveLength(1);
  });
});
