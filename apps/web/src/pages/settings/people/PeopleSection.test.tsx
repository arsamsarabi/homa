// The drawers are covered in e2e/people.spec.ts: closing a drawer on the Settings page stalls happy-dom.
import { describe, expect, test } from 'bun:test';
import { screen, within } from '@testing-library/react';
import { json, renderApp, signedInWith } from '@/testing/renderApp';

const settings = { homeTz: 'UTC', secondaryCalendar: 'none' };
const invite = (over: Record<string, unknown>) => ({
  id: 'i1',
  email: null,
  createdBy: { id: 'u1', name: 'Ada' },
  expiresAt: '2099-01-01T00:00:00Z',
  emailed: false,
  usedAt: null,
  usedBy: null,
  createdAt: '2026-11-20T00:00:00Z',
  ...over,
});
const people = [
  { id: 'u2', name: 'Bob', email: 'bob@example.com' },
  { id: 'u3', name: 'Carol', email: 'carol@example.com' },
];

describe('people settings', () => {
  test('an admin sees invites with their state, and circles with their members', async () => {
    const admin = signedInWith(settings, 'admin');
    renderApp('/settings?tab=people', (url, req) => {
      if (url.pathname === '/api/invites')
        return json([
          invite({ id: 'i1', email: 'dan@example.com' }),
          invite({ id: 'i2', usedAt: '2026-11-21T00:00:00Z', usedBy: { id: 'u2', name: 'Bob' } }),
        ]);
      if (url.pathname === '/api/people') return json(people);
      if (url.pathname === '/api/circles')
        return json([
          {
            id: 'c1',
            name: 'Family',
            color: '#669070',
            avatarSeed: 'family',
            avatarImage: null,
            memberIds: ['u2', 'u3'],
            createdAt: '2026-11-20T00:00:00Z',
          },
        ]);
      return admin(url, req);
    });
    const invites = await screen.findByRole('list', { name: 'Invites' });
    expect(await within(invites).findByText(/dan@example\.com/)).toBeTruthy();
    expect(within(invites).getByText('Open')).toBeTruthy();
    expect(within(invites).getByText('Joined')).toBeTruthy();
    // A used invite can't be revoked; an open one can.
    expect(within(invites).getAllByRole('button', { name: /Revoke/ })).toHaveLength(1);

    const circles = await screen.findByRole('list', { name: 'Circles' });
    expect(await within(circles).findByText('Bob and Carol')).toBeTruthy();
  });

  test('someone who may not invite sees only their circles', async () => {
    renderApp('/settings?tab=people', signedInWith(settings));
    expect(await screen.findByRole('heading', { name: 'Circles' })).toBeTruthy();
    expect(await screen.findByText('No circles yet.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Invites' })).toBeNull();
  });
});
