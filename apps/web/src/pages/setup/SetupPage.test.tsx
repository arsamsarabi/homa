import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, renderApp, sessionBody, setUpInstance } from '@/testing/renderApp';

const defaults = {
  name: 'Homa',
  signUps: 'open',
  defaultLanguage: 'en',
  defaultHomeTz: null,
  defaultSecondaryCalendar: 'none',
};

/** A new instance: nobody signed in until the sign-up call, then Ada is its admin. */
function newInstance(adminInstance: () => Response | Promise<Response> = () => json(defaults)) {
  const sent: { path: string; body: unknown }[] = [];
  let admin = false;
  const api = async (url: URL, req: Request): Promise<Response> => {
    const record = async (): Promise<unknown> => {
      const body = await req.json();
      sent.push({ path: url.pathname, body });
      return body;
    };
    switch (url.pathname) {
      case '/api/instance':
        return json(admin ? setUpInstance : { ...setUpInstance, needsSetup: true });
      case '/api/auth/get-session':
        return json(admin ? sessionBody('admin') : null);
      case '/api/auth/sign-up/email':
        await record();
        admin = true;
        return json({ token: 't', user: (sessionBody('admin') as { user: unknown }).user });
      case '/api/admin/instance':
        return req.method === 'PATCH' ? json({ ...defaults, ...((await record()) as object) }) : adminInstance();
      case '/api/settings':
        return req.method === 'PATCH'
          ? json({ homeTz: null, secondaryCalendar: 'none', ...((await record()) as object) })
          : json({ homeTz: null, secondaryCalendar: 'none' });
      default:
        return json({ error: `unexpected ${url.pathname}` }, 404);
    }
  };
  return { api, sent };
}

describe('setup journey', () => {
  test('a new instance sends signed-out visitors to setup', async () => {
    renderApp('/sign-in', newInstance().api);
    expect(await screen.findByRole('heading', { name: 'Set up your Homa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create admin account' })).toBeTruthy();
  });

  test('creates the admin, saves the instance and personal settings, then finishes', async () => {
    const { api, sent } = newInstance();
    renderApp('/', api);

    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));

    const name = await screen.findByRole('textbox', { name: /Instance name/ });
    expect((name as HTMLInputElement).value).toBe('Homa');
    fireEvent.change(name, { target: { value: 'Family' } });
    fireEvent.click(screen.getByLabelText('Nobody new'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText(/Now your own settings/);
    fireEvent.click(screen.getByLabelText('Jalali (Solar Hijri), with Persian occasions'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('All set. Your Homa is ready.')).toBeTruthy();
    expect(sent).toEqual([
      { path: '/api/auth/sign-up/email', body: expect.objectContaining({ email: 'ada@example.com', name: 'Ada' }) },
      { path: '/api/admin/instance', body: { name: 'Family', signUps: 'closed' } },
      { path: '/api/settings', body: { secondaryCalendar: 'jalali' } },
    ]);
  });

  test('the instance step shows a loading state, then a failure with a retry', async () => {
    let fail = true;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { api } = newInstance(async () => {
      await gate;
      return fail ? json({ error: 'database is down' }, 500) : json(defaults);
    });
    renderApp('/', api);

    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));

    expect(await screen.findByLabelText('Loading the instance settings')).toBeTruthy();
    release();
    expect(await screen.findByText('database is down')).toBeTruthy();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Instance name/ })).toBeTruthy());
  });
});
