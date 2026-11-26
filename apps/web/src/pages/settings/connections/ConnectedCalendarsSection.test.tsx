import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ownCalendar } from '@/testing/calendars';
import { type FakeApi, json, renderApp, setUpInstance, signedIn } from '@/testing/renderApp';

const calendar = ownCalendar({
  id: 'c2',
  name: 'UK holidays',
  color: '#336699',
  connectionId: 'k1',
  readOnly: true,
  createdAt: '2026-11-02T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
});
const ok = {
  id: 'k1',
  provider: 'ics',
  label: null,
  status: 'ok',
  lastError: null,
  lastSyncedAt: '2026-11-19T10:00:00Z',
  notice: null,
  noticeAt: null,
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

const work = { ...calendar, id: 'c9', name: 'Work', readOnly: false, connectionId: 'k3' };
const account = {
  ...ok,
  id: 'k3',
  provider: 'caldav',
  label: 'ada on caldav.fastmail.com',
  notice: 'Your change to "Lunch" conflicted with a change on the server, so the server\'s version was kept.',
  noticeAt: '2026-11-19T10:00:00Z',
  calendars: [work],
};
const remote = [
  {
    remoteId: 'https://caldav.fastmail.com/dav/calendars/user/ada/work/',
    name: 'Work',
    color: '#336699',
    readOnly: false,
    selected: false,
  },
  {
    remoteId: 'https://caldav.fastmail.com/dav/calendars/user/ada/shared/',
    name: 'Shared',
    color: null,
    readOnly: true,
    selected: false,
  },
];

type Sent = { method: string; path: string; body: unknown };

/** The settings page with these connections; every write is recorded and answered with `ok`. */
function api(list: () => Response | Promise<Response>, sent: Sent[] = []): FakeApi {
  return async (url, req) => {
    if (url.pathname === '/api/calendars') return json([]);
    if (url.pathname === '/api/holiday-calendars') return json(holidays);
    if (url.pathname === '/api/connections') return list();
    if (url.pathname.endsWith('/remote-calendars')) return json(remote);
    if (url.pathname.startsWith('/api/connections') || url.pathname.startsWith('/api/calendars/')) {
      const text = await req.text();
      sent.push({ method: req.method, path: url.pathname, body: text ? JSON.parse(text) : undefined });
      if (req.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname.startsWith('/api/calendars/')) return json(calendar);
      return json(url.pathname === '/api/connections/caldav' ? account : ok, 201);
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

  test('connects a CalDAV account with a provider preset, then chooses its calendars', async () => {
    const sent: Sent[] = [];
    renderApp(
      '/settings',
      api(() => json([]), sent),
    );
    fireEvent.click(within(await section()).getByRole('button', { name: 'Connect account' }));
    const drawer = await screen.findByRole('dialog', { name: 'Connect a CalDAV account' });
    const server = within(drawer).getByLabelText(/Server address/) as HTMLInputElement;
    expect(server.value).toBe('https://caldav.icloud.com');
    fireEvent.click(within(drawer).getByRole('combobox', { name: 'Provider' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Fastmail', hidden: true }));
    await waitFor(() => expect(server.value).toBe('https://caldav.fastmail.com'));
    fireEvent.change(within(drawer).getByLabelText(/User name/), { target: { value: 'ada' } });
    fireEvent.change(within(drawer).getByLabelText(/App password/), { target: { value: 'app-pass' } });
    submit(drawer);

    const picker = await screen.findByRole('dialog', { name: 'Choose calendars' });
    const workBox = (await within(picker).findByRole('checkbox', { name: /Work/ })) as HTMLInputElement;
    // A new account starts with every calendar checked.
    await waitFor(() => expect(workBox.checked).toBe(true));
    expect(within(picker).getByText('Read-only')).toBeTruthy();
    fireEvent.click(within(picker).getByRole('checkbox', { name: /Shared/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          method: 'POST',
          path: '/api/connections/caldav',
          body: { serverUrl: 'https://caldav.fastmail.com', username: 'ada', password: 'app-pass' },
        },
        { method: 'PUT', path: '/api/connections/k3/calendars', body: { remoteIds: [remote[0]?.remoteId] } },
      ]),
    );
  });
  test('offers mailbox.org, Posteo and Zoho Calendar presets, each with its server address and hint', async () => {
    renderApp(
      '/settings',
      api(() => json([])),
    );
    fireEvent.click(within(await section()).getByRole('button', { name: 'Connect account' }));
    const drawer = await screen.findByRole('dialog', { name: 'Connect a CalDAV account' });
    const server = within(drawer).getByLabelText(/Server address/) as HTMLInputElement;
    const choose = async (name: string): Promise<void> => {
      fireEvent.click(within(drawer).getByRole('combobox', { name: 'Provider' }));
      fireEvent.click(await screen.findByRole('option', { name, hidden: true }));
    };

    await choose('mailbox.org');
    await waitFor(() => expect(server.value).toBe('https://dav.mailbox.org'));
    expect(within(drawer).getByText(/mailbox\.org security settings/)).toBeTruthy();

    await choose('Posteo');
    await waitFor(() => expect(server.value).toBe('https://posteo.de:8443'));
    expect(within(drawer).getByText(/full Posteo address/)).toBeTruthy();

    await choose('Zoho Calendar');
    await waitFor(() => expect(server.value).toBe('https://calendar.zoho.com'));
    expect(within(drawer).getByText(/another region/)).toBeTruthy();
  });
  test('a CalDAV account shows its notice and calendars; notices dismiss and calendars rename', async () => {
    const sent: Sent[] = [];
    renderApp(
      '/settings',
      api(() => json([account]), sent),
    );
    const item = await within(await section()).findByRole('listitem', { name: 'ada on caldav.fastmail.com' });
    expect(within(item).getByText('Syncs both ways', { exact: false })).toBeTruthy();
    expect(within(item).getByText(/"Lunch" conflicted/)).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(sent).toEqual([{ method: 'DELETE', path: '/api/connections/k3/notice', body: undefined }]),
    );

    fireEvent.click(within(item).getByRole('button', { name: 'Rename or recolor Work' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit calendar' });
    fireEvent.change(within(drawer).getByLabelText(/Name/), { target: { value: 'Office' } });
    submit(drawer);
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: 'PATCH',
        path: '/api/calendars/c9',
        body: { name: 'Office', color: '#336699' },
      }),
    );

    fireEvent.click(within(item).getByRole('button', { name: 'Choose calendars' }));
    expect(await screen.findByRole('dialog', { name: 'Choose calendars' })).toBeTruthy();
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
  test('Google is offered only when the server is set up for it, as a link to the start endpoint', async () => {
    renderApp(
      '/settings',
      api(() => json([])),
    );
    await within(await section()).findByText('No connected calendars yet.');
    expect(screen.queryByRole('link', { name: 'Connect Google' })).toBeNull();
  });

  test("back from Google: the new account's calendar picker opens", async () => {
    const base = api(() => json([{ ...account, provider: 'google', label: 'ada@gmail.com', notice: null }]));
    renderApp('/settings?google=0b6f6f8e-3a35-4c1e-9d55-7c1e2a8c6f10', (url, req) =>
      url.pathname === '/api/instance' ? json({ ...setUpInstance, googleCalendar: true }) : base(url, req),
    );
    const link = await screen.findByRole('link', { name: 'Connect Google' });
    expect(link.getAttribute('href')).toBe('/api/connections/google/start');
    const picker = await screen.findByRole('dialog', { name: 'Choose calendars' });
    expect(await within(picker).findByRole('checkbox', { name: /Work/ })).toBeTruthy();
    const item = await within(await section()).findByRole('listitem', { name: 'ada@gmail.com' });
    expect(within(item).getByText('Syncs both ways', { exact: false })).toBeTruthy();
  });

  test('a failed Google connect says why', async () => {
    renderApp(
      '/settings?googleError=denied',
      api(() => json([])),
    );
    expect(await screen.findByText("Google wasn't connected: access wasn't granted.")).toBeTruthy();
  });

  test('Outlook is offered only when the server is set up for it', async () => {
    renderApp(
      '/settings',
      api(() => json([])),
    );
    await within(await section()).findByText('No connected calendars yet.');
    expect(screen.queryByRole('link', { name: 'Connect Outlook' })).toBeNull();
  });

  test("back from Microsoft: the new account's calendar picker opens", async () => {
    const base = api(() => json([{ ...account, provider: 'microsoft', label: 'ada@outlook.com', notice: null }]));
    renderApp('/settings?microsoft=0b6f6f8e-3a35-4c1e-9d55-7c1e2a8c6f10', (url, req) =>
      url.pathname === '/api/instance' ? json({ ...setUpInstance, microsoftCalendar: true }) : base(url, req),
    );
    const link = await screen.findByRole('link', { name: 'Connect Outlook' });
    expect(link.getAttribute('href')).toBe('/api/connections/microsoft/start');
    expect(screen.queryByRole('link', { name: 'Connect Google' })).toBeNull();
    const picker = await screen.findByRole('dialog', { name: 'Choose calendars' });
    expect(await within(picker).findByRole('checkbox', { name: /Work/ })).toBeTruthy();
    const item = await within(await section()).findByRole('listitem', { name: 'ada@outlook.com' });
    expect(within(item).getByText('Microsoft')).toBeTruthy();
  });

  test('a failed Microsoft connect says why', async () => {
    renderApp(
      '/settings?microsoftError=state',
      api(() => json([])),
    );
    expect(
      await screen.findByText(
        "Outlook wasn't connected: the request expired or didn't come from this browser. Try again.",
      ),
    ).toBeTruthy();
  });

  test('a calendar deleted on Google says so, and is removed from Homa after confirming', async () => {
    const sent: Sent[] = [];
    const ttrpg = { ...work, id: 'c10', name: 'TTRPG', remoteMissing: true };
    const google = { ...account, provider: 'google', label: 'ada@gmail.com', notice: null, calendars: [work, ttrpg] };
    const gone = { remoteId: 'ttrpg@group.calendar.google.com', name: 'TTRPG', color: '#336699' };
    const base = api(() => json([google]), sent);
    renderApp('/settings', (url, req) =>
      url.pathname.endsWith('/remote-calendars')
        ? json([...remote, { ...gone, readOnly: false, selected: true, missing: true }])
        : base(url, req),
    );
    const item = await within(await section()).findByRole('listitem', { name: 'ada@gmail.com' });
    expect(
      within(item).getByText('"TTRPG" was deleted on Google, or is no longer shared with this account.'),
    ).toBeTruthy();

    fireEvent.click(within(item).getByRole('button', { name: 'Choose calendars' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose calendars' });
    expect(await within(picker).findByRole('checkbox', { name: /TTRPG/ })).toBeTruthy();
    expect(within(picker).getByText('Deleted on Google')).toBeTruthy();
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(item).getByRole('button', { name: 'Remove from Homa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove this calendar?' });
    expect(within(dialog).getByText('Remove "TTRPG" and its events from Homa?')).toBeTruthy();
    expect(sent).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from Homa' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/api/calendars/c10', body: undefined }]));
  });
});
