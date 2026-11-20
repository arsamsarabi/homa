import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const user = signedInWith({ homeTz: 'Europe/London', secondaryCalendar: 'none' });
const pills = {
  id: 'r1',
  title: 'Pills',
  at: '2030-01-01T09:00:00Z',
  tz: 'Europe/London',
  rrule: 'FREQ=DAILY',
  nextFireAt: '2030-01-01T09:00:00Z',
  createdAt: '2026-11-01T00:00:00Z',
};

describe('reminders page', () => {
  test('lists reminders, creates one and deletes one', async () => {
    const sent: { method: string; path: string; body: unknown }[] = [];
    let list = [pills];
    renderApp('/reminders', async (url, req) => {
      if (url.pathname.startsWith('/api/reminders')) {
        const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.json();
        if (req.method !== 'GET') sent.push({ method: req.method, path: url.pathname, body });
        if (req.method === 'POST') {
          const created = { ...pills, id: 'r2', ...(body as object), nextFireAt: (body as { at: string }).at };
          list = [...list, created];
          return json(created, 201);
        }
        if (req.method === 'DELETE') {
          list = list.filter((r) => `/api/reminders/${r.id}` !== url.pathname);
          return new Response(null, { status: 204 });
        }
        return json(list);
      }
      return user(url, req);
    });
    const items = await screen.findByRole('list', { name: 'Reminders' });
    expect(within(items).getByText('Pills')).toBeTruthy();
    expect(items.textContent).toContain('Every day');

    fireEvent.click(screen.getByRole('button', { name: 'New reminder' }));
    const drawer = await screen.findByRole('dialog', { name: 'New reminder' });
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'What to remind you of' }), {
      target: { value: 'Call mum' },
    });
    fireEvent.change(within(drawer).getByLabelText(/^When/), { target: { value: '2030-07-01T17:00' } });
    fireEvent.change(within(drawer).getByRole('combobox', { name: 'Repeat' }), { target: { value: 'weekly' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent[0]).toEqual({
        method: 'POST',
        path: '/api/reminders',
        // 17:00 BST is 16:00Z.
        body: { title: 'Call mum', at: '2030-07-01T16:00:00.000Z', tz: 'Europe/London', rrule: 'FREQ=WEEKLY' },
      }),
    );
    expect(await screen.findByText('Call mum')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete "Pills"' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText('Pills')).toBeNull());
    expect(sent[1]).toMatchObject({ method: 'DELETE', path: '/api/reminders/r1' });
  });

  test('a failed load shows why, with a retry', async () => {
    renderApp('/reminders', (url, req) =>
      url.pathname === '/api/reminders' ? json({ error: 'database is down' }, 500) : user(url, req),
    );
    expect(await screen.findByText("Couldn't load your reminders")).toBeTruthy();
    expect(screen.getByText('database is down')).toBeTruthy();
  });
});
