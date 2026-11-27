import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const saved = { homeTz: 'Asia/Tehran', secondaryCalendar: 'none' };

describe('settings page', () => {
  test('shows the saved settings and saves a change', async () => {
    const sent: unknown[] = [];
    const user = signedInWith(saved);
    renderApp('/settings', async (url, req) => {
      if (url.pathname === '/api/settings' && req.method === 'PATCH') {
        const body = await req.json();
        sent.push(body);
        return json({ ...saved, ...body });
      }
      return user(url, req);
    });
    expect(((await screen.findByRole('combobox', { name: 'Home time zone' })) as HTMLInputElement).value).toBe(
      'Asia/Tehran',
    );
    fireEvent.click(screen.getByLabelText('Jalali (Solar Hijri), with Persian occasions'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([{ secondaryCalendar: 'jalali' }]));
  });

  test('a failed save shows why', async () => {
    const user = signedInWith(saved);
    renderApp('/settings', (url, req) =>
      url.pathname === '/api/settings' && req.method === 'PATCH'
        ? json({ error: 'database is down' }, 500)
        : user(url, req),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Couldn't save your settings: database is down")).toBeTruthy();
  });
});

describe('settings page: reminders', () => {
  test('the default reminder saves, and push says when this browser can’t', async () => {
    const sent: unknown[] = [];
    const user = signedInWith(saved);
    renderApp('/settings', async (url, req) => {
      if (url.pathname === '/api/settings' && req.method === 'PATCH') {
        const body = await req.json();
        sent.push(body);
        return json({ ...saved, ...body });
      }
      return user(url, req);
    });
    const select = (await screen.findByRole('combobox', { name: /^Default reminder/ })) as HTMLSelectElement;
    expect(select.value).toBe('10');
    fireEvent.change(select, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([{ defaultReminderMinutes: 60 }]));
    fireEvent.change(select, { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent[1]).toEqual({ defaultReminderMinutes: null }));
    // happy-dom has no PushManager.
    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
    expect(await screen.findByText(/This browser can't receive push notifications/)).toBeTruthy();
  });

  test('breadcrumbs lead back to the calendar and name the open tab', async () => {
    renderApp('/settings?tab=people', signedInWith(saved));
    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/');
    expect(within(trail).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings');
    expect(within(trail).getByText('People').getAttribute('aria-current')).toBe('page');
  });
});
