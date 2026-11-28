import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Poll } from '@/schemas';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const user = signedInWith({ homeTz: 'Europe/London', secondaryCalendar: 'none' });
const slots = [
  { id: 's1', start: '2030-12-06T19:00:00Z', end: '2030-12-06T20:30:00Z' },
  { id: 's2', start: '2030-12-07T18:00:00Z', end: '2030-12-07T19:30:00Z' },
  { id: 's3', start: '2030-12-10T19:00:00Z', end: '2030-12-10T20:30:00Z' },
];
const poll: Poll = {
  id: 'p1',
  title: 'Book club',
  description: null,
  location: null,
  durationMinutes: 90,
  tz: 'Europe/London',
  status: 'open',
  deadline: null,
  quorum: null,
  holds: false,
  calendarId: null,
  finalSlotId: null,
  organizer: { id: 'u-ada', name: 'Ada' },
  slots,
  participants: [
    { id: 'pa', userId: 'u-ada', name: 'Ada', required: true, responded: false, holds: false },
    { id: 'pb', userId: 'u-bob', name: 'Bob', required: false, responded: false, holds: false },
  ],
  answers: [],
  results: slots.map((s) => ({
    slotId: s.id,
    points: 0,
    canMake: [],
    cannot: [],
    unranked: ['pa', 'pb'],
    eligible: false,
    requiredCannot: [],
    needed: 2,
  })),
  busy: null,
  me: { participantId: 'pb', organizer: false },
  createdAt: '2030-11-01T00:00:00Z',
};

describe('poll page', () => {
  test('the ballot starts with clashes under can’t, ranks with buttons and saves the answer', async () => {
    const sent: unknown[] = [];
    renderApp('/polls/p1', async (url, req) => {
      if (url.pathname === '/api/polls/p1/prefill') return json({ cannot: ['s2'] });
      if (url.pathname === '/api/polls/p1/answers') {
        sent.push(await req.json());
        return json(poll);
      }
      if (url.pathname === '/api/polls/p1') return json(poll);
      return user(url, req);
    });
    const cannot = await screen.findByRole('list', { name: "Can't make it" });
    await waitFor(() => expect(within(cannot).getByText(/Sat, Dec 7/)).toBeTruthy());
    expect(within(cannot).getByText('Busy in your calendar')).toBeTruthy();

    const unranked = screen.getByRole('list', { name: 'Not ranked yet' });
    const row = (d: RegExp): HTMLElement => within(unranked).getByText(d).closest('li') as HTMLElement;
    const [tue, fri] = [row(/Tue, Dec 10/), row(/Fri, Dec 6/)];
    fireEvent.click(within(tue).getByRole('button', { name: 'Rank' }));
    fireEvent.click(within(fri).getByRole('button', { name: 'Rank' }));
    fireEvent.click(screen.getByRole('button', { name: /Move Fri, Dec 6.* up/ }));
    const order = screen.getByRole('list', { name: 'Your order' });
    expect(
      within(order)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.match(/\w{3}, Dec \d+/)?.[0]),
    ).toEqual(['Fri, Dec 6', 'Tue, Dec 10']);

    fireEvent.click(screen.getByRole('button', { name: 'Save my answer' }));
    await waitFor(() => expect(sent).toEqual([{ ranked: ['s1', 's3'], cannot: ['s2'], holds: false }]));
  });

  test('the organizer sees results and picks a time', async () => {
    const sent: { path: string; body: unknown }[] = [];
    const mine: Poll = {
      ...poll,
      me: { participantId: 'pa', organizer: true },
      results: [
        {
          ...(poll.results[0] as Poll['results'][number]),
          points: 3,
          canMake: ['pa', 'pb'],
          unranked: [],
          eligible: true,
        },
        ...poll.results.slice(1),
      ],
    };
    renderApp('/polls/p1', async (url, req) => {
      if (url.pathname === '/api/polls/p1/finalize') {
        sent.push({ path: url.pathname, body: await req.json() });
        return json({ ...mine, status: 'finalized', finalSlotId: 's1' });
      }
      if (url.pathname === '/api/polls/p1') return json(mine);
      if (url.pathname === '/api/calendars')
        return json([
          {
            id: 'c1',
            name: 'Personal',
            color: '#228be6',
            connectionId: null,
            readOnly: false,
            hidden: false,
            remoteMissing: false,
            access: 'owner',
            owner: { id: 'u-ada', name: 'Ada' },
            createdAt: '2030-01-01T00:00:00Z',
            updatedAt: '2030-01-01T00:00:00Z',
          },
        ]);
      return user(url, req);
    });
    expect(await screen.findByText(/Recommended: Fri, Dec 6/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Pick Fri, Dec 6/ }));
    const modal = await screen.findByRole('dialog', { name: 'Set the time' });
    expect(within(modal).getByText('1 other person gets it in their calendar.')).toBeTruthy();
    await waitFor(() =>
      expect((within(modal).getByRole('button', { name: 'Set the time' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(modal).getByRole('button', { name: 'Set the time' }));
    await waitFor(() =>
      expect(sent).toEqual([{ path: '/api/polls/p1/finalize', body: { slotId: 's1', calendarId: 'c1' } }]),
    );
  });
});
