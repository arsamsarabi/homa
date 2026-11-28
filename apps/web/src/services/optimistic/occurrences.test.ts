import { describe, expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { tempOccurrence, withoutRemoved, withPatched, withRealId } from './occurrences';

const occ = (over: Partial<Occurrence> & Pick<Occurrence, 'eventId' | 'recurrenceId'>): Occurrence => ({
  calendarId: 'c1',
  start: over.recurrenceId,
  end: over.recurrenceId,
  summary: 'S',
  description: null,
  location: null,
  allDay: false,
  tz: 'UTC',
  recurring: true,
  overridden: false,
  taskId: null,
  taskDone: false,
  createdBy: null,
  travelMinutes: null,
  ...over,
});

describe('withoutRemoved', () => {
  const list = [
    occ({ eventId: 'e1', recurrenceId: '2026-01-01T10:00:00Z' }),
    occ({ eventId: 'e1', recurrenceId: '2026-01-08T10:00:00Z' }),
    occ({ eventId: 'e2', recurrenceId: '2026-01-01T10:00:00Z' }),
  ];

  test('all drops the whole series', () => {
    expect(withoutRemoved(list, 'e1', 'all', undefined).map((o) => o.eventId)).toEqual(['e2']);
  });

  test('this drops one occurrence', () => {
    expect(withoutRemoved(list, 'e1', 'this', '2026-01-01T10:00:00Z').map((o) => o.recurrenceId)).toEqual([
      '2026-01-08T10:00:00Z',
      '2026-01-01T10:00:00Z',
    ]);
  });

  test('following drops from that recurrence on', () => {
    expect(withoutRemoved(list, 'e1', 'following', '2026-01-08T10:00:00Z').map((o) => o.recurrenceId)).toEqual([
      '2026-01-01T10:00:00Z',
      '2026-01-01T10:00:00Z',
    ]);
  });
});

describe('withPatched', () => {
  test('patches matching occurrences', () => {
    const list = [occ({ eventId: 'e1', recurrenceId: 'a', summary: 'Old' })];
    expect(withPatched(list, 'e1', { summary: 'New' }, 'all', undefined)[0]?.summary).toBe('New');
  });

  test('a move updates recurrenceId on a non-recurring event', () => {
    const list = [occ({ eventId: 'e1', recurrenceId: '2026-01-01T10:00:00Z', recurring: false })];
    const next = withPatched(
      list,
      'e1',
      { start: '2026-01-01T12:00:00Z', end: '2026-01-01T13:00:00Z' },
      'all',
      undefined,
    );
    expect(next[0]?.start).toBe('2026-01-01T12:00:00Z');
    expect(next[0]?.recurrenceId).toBe('2026-01-01T12:00:00Z');
  });
});

describe('temp create', () => {
  test('builds a ghost occurrence and swaps its id', () => {
    const temp = tempOccurrence(
      {
        calendarId: 'c1',
        summary: 'Dentist',
        start: '2026-01-01T10:00:00Z',
        end: '2026-01-01T11:00:00Z',
        allDay: false,
        tz: 'UTC',
      },
      'temp-1',
    );
    expect(temp.eventId).toBe('temp-1');
    expect(withRealId([temp], 'temp-1', 'real')[0]?.eventId).toBe('real');
  });
});
