import { expect, test } from 'bun:test';
import { accessAtLeast, maxGrantLevel, resolveAccess } from './access';

const base = {
  isOwner: false,
  personGrant: null as null,
  circleGrants: [] as const,
  calendarDefault: null as null,
  ownerPreset: 'private' as const,
};

test('owner always gets owner, ignoring grants and defaults', () => {
  expect(
    resolveAccess({
      ...base,
      isOwner: true,
      personGrant: 'none',
      circleGrants: ['edit'],
      calendarDefault: 'read',
      ownerPreset: 'freebusy',
    }),
  ).toBe('owner');
});

test('person grant wins, including none over a circle read', () => {
  expect(
    resolveAccess({
      ...base,
      personGrant: 'none',
      circleGrants: ['read'],
      calendarDefault: 'freebusy',
      ownerPreset: 'read',
    }),
  ).toBe('none');
  expect(resolveAccess({ ...base, personGrant: 'edit', circleGrants: ['read'] })).toBe('edit');
  expect(resolveAccess({ ...base, personGrant: 'freebusy' })).toBe('freebusy');
});

test('highest circle grant wins when there is no person grant', () => {
  expect(resolveAccess({ ...base, circleGrants: ['freebusy', 'read', 'none'] })).toBe('read');
  expect(resolveAccess({ ...base, circleGrants: ['none', 'freebusy'] })).toBe('freebusy');
  expect(resolveAccess({ ...base, circleGrants: ['edit'] })).toBe('edit');
  expect(resolveAccess({ ...base, circleGrants: ['none'] })).toBe('none');
});

test('calendar default applies when there is no person or circle grant', () => {
  expect(resolveAccess({ ...base, calendarDefault: 'none' })).toBe('none');
  expect(resolveAccess({ ...base, calendarDefault: 'freebusy', ownerPreset: 'read' })).toBe('freebusy');
  expect(resolveAccess({ ...base, calendarDefault: 'read', ownerPreset: 'private' })).toBe('read');
});

test('owner preset applies last; private means none; defaults never yield edit', () => {
  expect(resolveAccess({ ...base, ownerPreset: 'private' })).toBe('none');
  expect(resolveAccess({ ...base, ownerPreset: 'freebusy' })).toBe('freebusy');
  expect(resolveAccess({ ...base, ownerPreset: 'read' })).toBe('read');
});

test('maxGrantLevel picks the strongest grant level', () => {
  expect(maxGrantLevel([])).toBeUndefined();
  expect(maxGrantLevel(['none'])).toBe('none');
  expect(maxGrantLevel(['none', 'freebusy', 'read'])).toBe('read');
  expect(maxGrantLevel(['edit', 'none'])).toBe('edit');
});

test('accessAtLeast compares effective levels for route checks', () => {
  expect(accessAtLeast('owner', 'edit')).toBe(true);
  expect(accessAtLeast('edit', 'read')).toBe(true);
  expect(accessAtLeast('read', 'edit')).toBe(false);
  expect(accessAtLeast('freebusy', 'freebusy')).toBe(true);
  expect(accessAtLeast('none', 'freebusy')).toBe(false);
});
