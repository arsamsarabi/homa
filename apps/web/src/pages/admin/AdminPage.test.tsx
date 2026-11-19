import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const saved = {
  name: 'Family',
  signUps: 'open',
  defaultLanguage: 'en',
  defaultHomeTz: 'Asia/Tehran',
  defaultSecondaryCalendar: 'none',
};
const admin = signedInWith({ homeTz: null, secondaryCalendar: 'none' }, 'admin');

describe('admin page', () => {
  test('shows a loading state, then the saved settings, and saves a change', async () => {
    const sent: unknown[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    renderApp('/admin', async (url, req) => {
      if (url.pathname !== '/api/admin/instance') return admin(url, req);
      if (req.method === 'PATCH') {
        const body = await req.json();
        sent.push(body);
        return json({ ...saved, ...body });
      }
      await gate;
      return json(saved);
    });
    expect(await screen.findByLabelText('Loading the instance settings')).toBeTruthy();
    release();
    const name = (await screen.findByRole('textbox', { name: /Instance name/ })) as HTMLInputElement;
    expect(name.value).toBe('Family');
    expect((screen.getByRole('combobox', { name: /Default home time zone/ }) as HTMLInputElement).value).toBe(
      'Asia/Tehran',
    );
    fireEvent.click(screen.getByLabelText('Nobody new'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([{ signUps: 'closed' }]));
  });

  test('a failed load shows why and can retry', async () => {
    let fail = true;
    renderApp('/admin', (url, req) =>
      url.pathname !== '/api/admin/instance'
        ? admin(url, req)
        : fail
          ? json({ error: 'database is down' }, 500)
          : json(saved),
    );
    expect(await screen.findByText('database is down')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('textbox', { name: /Instance name/ })).toBeTruthy();
  });

  test('a failed save shows why', async () => {
    renderApp('/admin', (url, req) =>
      url.pathname !== '/api/admin/instance'
        ? admin(url, req)
        : req.method === 'PATCH'
          ? json({ error: 'Only an admin can do that' }, 403)
          : json(saved),
    );
    fireEvent.click(await screen.findByLabelText('Nobody new'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Couldn't save the instance settings: Only an admin can do that")).toBeTruthy();
  });

  test('people who are not admins go to the calendar instead', async () => {
    const user = signedInWith({ homeTz: null, secondaryCalendar: 'none' });
    renderApp('/admin', (url, req) =>
      url.pathname.startsWith('/api/calendars') || url.pathname.startsWith('/api/occurrences')
        ? json([])
        : user(url, req),
    );
    expect(await screen.findByRole('button', { name: 'New event' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Instance settings' })).toBeNull();
  });

  test('the settings page links admins to it', async () => {
    renderApp('/settings', admin);
    expect(await screen.findByRole('link', { name: 'Change the instance settings' })).toBeTruthy();
  });

  test('the settings page has no such link for everyone else', async () => {
    renderApp('/settings', signedInWith({ homeTz: null, secondaryCalendar: 'none' }));
    await screen.findByRole('button', { name: 'Save' });
    expect(screen.queryByRole('link', { name: 'Change the instance settings' })).toBeNull();
  });
});
