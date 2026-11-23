import { describe, expect, test } from 'bun:test';
import type { Invite } from '@/schemas';
import { inviteLink, inviteStatus } from './people';

const invite = (over: Partial<Invite>): Invite => ({
  id: 'i',
  email: null,
  createdBy: { id: 'a', name: 'Ada' },
  expiresAt: '2026-12-01T00:00:00Z',
  emailed: false,
  usedAt: null,
  usedBy: null,
  createdAt: '2026-11-24T00:00:00Z',
  ...over,
});

describe('inviteStatus', () => {
  const now = new Date('2026-11-25T00:00:00Z');
  test('pending until it expires, used once used', () => {
    expect(inviteStatus(invite({}), now)).toBe('pending');
    expect(inviteStatus(invite({ expiresAt: '2026-11-25T00:00:00Z' }), now)).toBe('expired');
    expect(inviteStatus(invite({ usedAt: '2026-11-24T10:00:00Z', expiresAt: '2026-11-01T00:00:00Z' }), now)).toBe(
      'used',
    );
  });
});

test('inviteLink encodes the token', () => {
  expect(inviteLink('https://homa.example', 'a b')).toBe('https://homa.example/sign-up?invite=a%20b');
});
