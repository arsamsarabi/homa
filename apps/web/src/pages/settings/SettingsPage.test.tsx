import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
