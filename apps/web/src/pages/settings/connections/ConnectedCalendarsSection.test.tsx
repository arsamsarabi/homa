import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type FakeApi, json, renderApp, signedIn } from '@/testing/renderApp';

const calendar = {
  id: 'c2',
  name: 'UK holidays',
  color: '#336699',
  connectionId: 'k1',
  readOnly: true,
  createdAt: '2026-11-02T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
};
const ok = {
  id: 'k1',
  provider: 'ics',
  status: 'ok',
  lastError: null,
  lastSyncedAt: '2026-11-19T10:00:00Z',
  createdAt: '2026-11-02T00:00:00Z',
  calendars: [calendar],
};
const failing = {
  ...ok,
  id: 'k2',
  status: 'error',
  lastError: "The feed's server answered 404",
  calendars: [{ ...calendar, id: 'c3', name: 'School', connectionId: 'k2' }],
};
const holidays = [
  { id: 'gb-eaw', country: 'GB', names: { en: 'UK: England and Wales', fa: 'بریتانیا' }, source: 'GOV.UK, OGL' },
];

type Sent = { method: string; path: string; body: unknown };

/** The settings page with these connections; every write is recorded and answered with `ok`. */
function api(list: () => Response | Promise<Response>, sent: Sent[] = []): FakeApi {
  return async (url, req) => {
    if (url.pathname === '/api/calendars') return json([]);
    if (url.pathname === '/api/holiday-calendars') return json(holidays);
    if (url.pathname === '/api/connections') return list();
    if (url.pathname.startsWith('/api/connections')) {
      const text = await req.text();
      sent.push({ method: req.method, path: url.pathname, body: text ? JSON.parse(text) : undefined });
      return req.method === 'DELETE' ? new Response(null, { status: 204 }) : json(ok, 201);
    }
    return signedIn(url, req);
  };
}

/** Submits the drawer's form (happy-dom doesn't submit a form when its submit button is clicked). */
function submit(drawer: HTMLElement): void {
  const form = drawer.querySelector('form');
  if (!form) throw new Error('no form');
  fireEvent.submit(form);
}

const section = (): Promise<HTMLElement> => screen.findByRole('region', { name: 'Connected calendars' });

describe('connected calendars section', () => {
  test('lists connections with their status and last error; sync now and remove call the API', async () => {
    const sent: Sent[] = [];
    renderApp(
      '/settings',
      api(() => json([ok, failing]), sent),
    );
    const s = await section();
    const school = await within(s).findByRole('listitem', { name: 'School' });
    expect(within(school).getByText('Error')).toBeTruthy();
    expect(within(school).getByText("Last sync failed: The feed's server answered 404")).toBeTruthy();
    const uk = within(s).getByRole('listitem', { name: 'UK holidays' });
    expect(within(uk).getByText('Up to date')).toBeTruthy();
    expect(within(uk).getByText(/Last checked/)).toBeTruthy();

    fireEvent.click(within(school).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'POST', path: '/api/connections/k2/sync', body: undefined }]));

    fireEvent.click(within(uk).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove this calendar?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({ method: 'DELETE', path: '/api/connections/k1', body: undefined }),
    );
  });

  test('subscribes by address, and shows why a subscription failed', async () => {
    const sent: Sent[] = [];
    let fail = true;
    const base = api(() => json([]), sent);
    renderApp('/settings', async (url, req) => {
      if (url.pathname === '/api/connections/ics' && fail) {
        fail = false;
        return json({ error: "Couldn't subscribe: The feed's server answered 404" }, 400);
      }
      return base(url, req);
    });
    const s = await section();
    expect(await within(s).findByText('No connected calendars yet.')).toBeTruthy();
    fireEvent.click(within(s).getByRole('button', { name: 'Add calendar' }));
    const drawer = await screen.findByRole('dialog', { name: 'Add a calendar' });
    fireEvent.change(within(drawer).getByLabelText(/Calendar address/), {
      target: { value: 'webcal://example.com/school.ics' },
    });
    submit(drawer);
    expect(await within(drawer).findByText("Couldn't subscribe: The feed's server answered 404")).toBeTruthy();
    submit(drawer);
    await waitFor(() =>
      expect(sent).toEqual([
        { method: 'POST', path: '/api/connections/ics', body: { url: 'webcal://example.com/school.ics' } },
      ]),
    );
  });

  test('adds a holiday calendar from the catalog, named in the current language', async () => {
    const sent: Sent[] = [];
    renderApp(
      '/settings',
      api(() => json([]), sent),
    );
    fireEvent.click(within(await section()).getByRole('button', { name: 'Add calendar' }));
    const drawer = await screen.findByRole('dialog', { name: 'Add a calendar' });
    fireEvent.click(within(drawer).getByText('Public holidays'));
    const select = await within(drawer).findByRole('combobox', { name: /Holiday calendar/ });
    await waitFor(() => expect(select.hasAttribute('disabled')).toBe(false));
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'UK: England and Wales', hidden: true }));
    expect(await within(drawer).findByText('Source: GOV.UK, OGL')).toBeTruthy();
    submit(drawer);
    await waitFor(() =>
      expect(sent).toEqual([
        { method: 'POST', path: '/api/connections/ics', body: { holidayId: 'gb-eaw', name: 'UK: England and Wales' } },
      ]),
    );
  });

  test('a failed load can be retried', async () => {
    let fail = true;
    renderApp(
      '/settings',
      api(() => (fail ? json({ error: 'database is down' }, 500) : json([ok]))),
    );
    const s = await section();
    expect(await within(s).findByText("Couldn't load your connected calendars")).toBeTruthy();
    fail = false;
    fireEvent.click(within(s).getByRole('button', { name: 'Try again' }));
    expect(await within(s).findByRole('listitem', { name: 'UK holidays' })).toBeTruthy();
  });
});
