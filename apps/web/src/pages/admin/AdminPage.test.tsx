import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const saved = {
  name: 'Family',
  signUps: 'open',
  invites: 'admins',
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
    let releaseSave: () => void = () => undefined;
    const saveGate = new Promise<void>((r) => {
      releaseSave = r;
    });
    renderApp('/admin', async (url, req) => {
      if (url.pathname !== '/api/admin/instance') return admin(url, req);
      if (req.method === 'PATCH') {
        const body = await req.json();
        sent.push(body);
        await saveGate;
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
    // Sign-ups live on their own tab; the name edit there and here share one draft.
    fireEvent.click(screen.getByRole('tab', { name: 'Sign-ups and invites' }));
    fireEvent.click(await screen.findByLabelText('Only people with an invite'));
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
    expect(save.getAttribute('data-loading')).toBe('true');
    releaseSave();
    await waitFor(() => expect(sent).toEqual([{ signUps: 'closed' }]));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((el) => el.textContent?.includes('Instance settings saved'))).toBe(true);
    });
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
    renderApp('/admin?tab=access', (url, req) =>
      url.pathname !== '/api/admin/instance'
        ? admin(url, req)
        : req.method === 'PATCH'
          ? json({ error: 'Only an admin can do that' }, 403)
          : json(saved),
    );
    fireEvent.click(await screen.findByLabelText('Only people with an invite'));
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

  test('the account menu links admins to it', async () => {
    renderApp('/settings', admin);
    fireEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Admin' })).toBeTruthy();
  });

  test('the account menu has no Admin item for everyone else', async () => {
    renderApp('/settings', signedInWith({ homeTz: null, secondaryCalendar: 'none' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    await screen.findByRole('menuitem', { name: 'Settings' });
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull();
  });

  test('single sign-on has its own tab', async () => {
    renderApp('/admin?tab=sso', (url, req) => (url.pathname !== '/api/admin/instance' ? admin(url, req) : json(saved)));
    expect(await screen.findByRole('heading', { name: 'Single sign-on' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Instance name/ })).toBeNull();
  });
});
