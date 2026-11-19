import { describe, expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import {
  buildEditorResult,
  type Draft,
  type FormInput,
  formTimes,
  newEventSlot,
  parseFormTimes,
  repeatOf,
  rruleOf,
  shownRepeat,
} from './event-form';

const occurrence: Occurrence = {
  eventId: 'e1',
  calendarId: 'c1',
  recurrenceId: '2026-11-19T00:00:00Z',
  start: '2026-11-19T00:00:00Z',
  end: '2026-11-21T00:00:00Z',
  summary: 'Trip',
  description: null,
  location: null,
  allDay: true,
  tz: 'UTC',
  recurring: true,
  overridden: false,
};
const edit: Draft = { kind: 'edit', occurrence };
const create: Draft = {
  kind: 'create',
  start: new Date(2026, 10, 19, 9),
  end: new Date(2026, 10, 19, 10),
  allDay: false,
};
const input = (over: Partial<FormInput>): FormInput => ({
  summary: 'Trip',
  description: '',
  location: '',
  start: '2026-11-19',
  end: '2026-11-20',
  allDay: true,
  calendarId: 'c1',
  repeat: undefined,
  ...over,
});
const ctx = { seriesRrule: 'FREQ=WEEKLY', tz: 'Europe/London' };

test('repeat choices round-trip to RRULEs', () => {
  expect(repeatOf('FREQ=WEEKLY')).toBe('weekly');
  expect(repeatOf('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('custom');
  expect(rruleOf('daily', null)).toBe('FREQ=DAILY');
  expect(rruleOf('custom', 'FREQ=WEEKLY;BYDAY=MO')).toBe('FREQ=WEEKLY;BYDAY=MO');
  expect(rruleOf('none', 'FREQ=DAILY')).toBeNull();
});

describe('form values', () => {
  test('all-day end dates show inclusive', () => {
    expect(formTimes(edit, true)).toEqual({ start: '2026-11-19', end: '2026-11-20' });
  });
  test('switching an all-day event to timed starts with an hour', () => {
    expect(formTimes(edit, false)).toEqual({ start: '2026-11-19T00:00', end: '2026-11-19T01:00' });
  });
  test('a recurring event shows its series repeat until one is picked', () => {
    expect(shownRepeat(edit, undefined, 'FREQ=WEEKLY')).toBe('weekly');
    expect(shownRepeat(edit, 'none', 'FREQ=WEEKLY')).toBe('none');
    expect(shownRepeat(create, undefined, undefined)).toBe('none');
  });
  test('backwards times are rejected', () => {
    expect(parseFormTimes(false, '2026-11-19T10:00', '2026-11-19T09:00')).toBeUndefined();
  });
});

describe('buildEditorResult', () => {
  test('a new timed event uses the browser zone', () => {
    const r = buildEditorResult(
      create,
      input({ allDay: false, start: '2026-11-19T09:00', end: '2026-11-19T10:00', repeat: 'daily' }),
      ctx,
    );
    expect(r).toMatchObject({ kind: 'create', body: { tz: 'Europe/London', allDay: false, rrule: 'FREQ=DAILY' } });
  });
  test('an all-day edit sends exclusive UTC midnights and no series change', () => {
    const r = buildEditorResult(edit, input({}), ctx);
    expect(r).toEqual({
      kind: 'edit',
      occurrence,
      patch: {
        summary: 'Trip',
        description: null,
        location: null,
        start: '2026-11-19T00:00:00.000Z',
        end: '2026-11-21T00:00:00.000Z',
      },
      seriesChanged: false,
    });
  });
  test('calendar, all-day and repeat changes mark the series as changed', () => {
    const r = buildEditorResult(edit, input({ calendarId: 'c2', repeat: 'none' }), ctx);
    expect(r).toMatchObject({ seriesChanged: true, patch: { calendarId: 'c2', rrule: null } });
  });
  test('backwards times come back as an error', () => {
    expect(buildEditorResult(edit, input({ start: '2026-11-20', end: '2026-11-19' }), ctx)).toBe('endBeforeStart');
  });
});

test('new events start at the next whole hour on the shown day', () => {
  const slot = newEventSlot(new Date(2026, 10, 21), new Date(2026, 10, 19, 14, 20));
  expect(slot).toEqual({ start: new Date(2026, 10, 21, 15), end: new Date(2026, 10, 21, 16) });
});
