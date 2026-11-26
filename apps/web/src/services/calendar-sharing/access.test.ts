import { describe, expect, test } from 'bun:test';
import type { Calendar } from '@/schemas';
import {
  groupSharedByOwner,
  isFreeBusyCalendar,
  isReadOnlyCalendar,
  isWritableCalendar,
  occurrenceTitle,
  writableCalendarPickerGroups,
} from './access';

const cal = (partial: Partial<Calendar> & Pick<Calendar, 'id' | 'name' | 'access'>): Calendar => ({
  color: '#4a4e69',
  connectionId: null,
  readOnly: false,
  hidden: false,
  remoteMissing: false,
  owner: { id: 'u1', name: 'Ada' },
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...partial,
});

describe('calendar access helpers', () => {
  test('writable: owner non-subscription and edit, not freebusy/read/subscription', () => {
    expect(isWritableCalendar(cal({ id: '1', name: 'Mine', access: 'owner' }))).toBe(true);
    expect(isWritableCalendar(cal({ id: '2', name: 'Sub', access: 'owner', readOnly: true }))).toBe(false);
    expect(isWritableCalendar(cal({ id: '3', name: 'Edit', access: 'edit', owner: { id: 'u2', name: 'Bob' } }))).toBe(
      true,
    );
    expect(isWritableCalendar(cal({ id: '4', name: 'Read', access: 'read', owner: { id: 'u2', name: 'Bob' } }))).toBe(
      false,
    );
    expect(
      isWritableCalendar(cal({ id: '5', name: 'Busy', access: 'freebusy', owner: { id: 'u2', name: 'Bob' } })),
    ).toBe(false);
    expect(isReadOnlyCalendar(cal({ id: '4', name: 'Read', access: 'read', owner: { id: 'u2', name: 'Bob' } }))).toBe(
      true,
    );
    expect(
      isFreeBusyCalendar(cal({ id: '5', name: 'Busy', access: 'freebusy', owner: { id: 'u2', name: 'Bob' } })),
    ).toBe(true);
  });

  test('occurrenceTitle uses Busy for freebusy', () => {
    const labels = { busy: 'Busy', untitled: '(untitled)' };
    expect(occurrenceTitle('', 'freebusy', labels)).toBe('Busy');
    expect(occurrenceTitle('Dentist', 'read', labels)).toBe('Dentist');
    expect(occurrenceTitle('', 'owner', labels)).toBe('(untitled)');
  });

  test('groupSharedByOwner skips owned and sorts by owner name', () => {
    const list = [
      cal({ id: 'a', name: 'Mine', access: 'owner' }),
      cal({ id: 'b', name: 'Bob work', access: 'read', owner: { id: 'u2', name: 'Bob' } }),
      cal({ id: 'c', name: 'Ada shared', access: 'freebusy', owner: { id: 'u3', name: 'Zed' } }),
      cal({ id: 'd', name: 'Bob home', access: 'edit', owner: { id: 'u2', name: 'Bob' } }),
    ];
    const bobWork = list[1];
    const zed = list[2];
    const bobHome = list[3];
    expect(bobWork && zed && bobHome).toBeTruthy();
    expect(groupSharedByOwner(list)).toEqual([
      {
        ownerId: 'u2',
        ownerName: 'Bob',
        calendars: [bobWork, bobHome],
      },
      {
        ownerId: 'u3',
        ownerName: 'Zed',
        calendars: [zed],
      },
    ]);
  });

  test('writableCalendarPickerGroups groups mine then shared edit by owner', () => {
    const list = [
      cal({ id: 'a', name: 'Personal', access: 'owner' }),
      cal({ id: 'b', name: 'Sub', access: 'owner', readOnly: true }),
      cal({ id: 'c', name: 'Bob edit', access: 'edit', owner: { id: 'u2', name: 'Bob' } }),
      cal({ id: 'd', name: 'Bob read', access: 'read', owner: { id: 'u2', name: 'Bob' } }),
    ];
    expect(writableCalendarPickerGroups(list, 'My calendars', (n) => `Shared by ${n}`)).toEqual([
      { group: 'My calendars', items: [{ value: 'a', label: 'Personal' }] },
      { group: 'Shared by Bob', items: [{ value: 'c', label: 'Bob edit' }] },
    ]);
  });
});
