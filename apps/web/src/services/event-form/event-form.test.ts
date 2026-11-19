import { describe, expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import {
  buildEditorResult,
  type Draft,
  draftZone,
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
// 09:00–10:00 in Tehran (UTC+3:30).
const create: Draft = {
  kind: 'create',
  start: new Date('2026-11-19T05:30:00Z'),
  end: new Date('2026-11-19T06:30:00Z'),
  allDay: false,
};
const input = (over: Partial<FormInput>): FormInput => ({
  summary: 'Trip',
  description: '',
  location: '',
  start: '2026-11-19',
  end: '2026-11-20',
  allDay: true,
  tz: 'Europe/London',
  calendarId: 'c1',
  repeat: undefined,
  ...over,
});
const ctx = { seriesRrule: 'FREQ=WEEKLY' };

test('repeat choices round-trip to RRULEs', () => {
  expect(repeatOf('FREQ=WEEKLY')).toBe('weekly');
  expect(repeatOf('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('custom');
  expect(rruleOf('daily', null)).toBe('FREQ=DAILY');
  expect(rruleOf('custom', 'FREQ=WEEKLY;BYDAY=MO')).toBe('FREQ=WEEKLY;BYDAY=MO');
  expect(rruleOf('none', 'FREQ=DAILY')).toBeNull();
});

describe('form values', () => {
  test('all-day end dates show inclusive', () => {
    expect(formTimes(edit, true, 'Asia/Tehran')).toEqual({ start: '2026-11-19', end: '2026-11-20' });
  });
  test('switching an all-day event to timed starts with an hour', () => {
    expect(formTimes(edit, false, 'Asia/Tehran')).toEqual({ start: '2026-11-19T00:00', end: '2026-11-19T01:00' });
  });
  test('timed drafts show in the form zone', () => {
    expect(formTimes(create, false, 'Asia/Tehran')).toEqual({ start: '2026-11-19T09:00', end: '2026-11-19T10:00' });
    expect(formTimes(create, false, 'UTC')).toEqual({ start: '2026-11-19T05:30', end: '2026-11-19T06:30' });
  });
  test("the form starts in a timed event's own zone, else the viewed one", () => {
    expect(draftZone(create, 'Asia/Tehran')).toBe('Asia/Tehran');
    expect(draftZone(edit, 'Asia/Tehran')).toBe('Asia/Tehran');
    const timed: Draft = { kind: 'edit', occurrence: { ...occurrence, allDay: false, tz: 'America/New_York' } };
    expect(draftZone(timed, 'Asia/Tehran')).toBe('America/New_York');
  });
  test('a recurring event shows its series repeat until one is picked', () => {
    expect(shownRepeat(edit, undefined, 'FREQ=WEEKLY')).toBe('weekly');
    expect(shownRepeat(edit, 'none', 'FREQ=WEEKLY')).toBe('none');
    expect(shownRepeat(create, undefined, undefined)).toBe('none');
  });
  test('backwards times are rejected', () => {
    expect(parseFormTimes(false, '2026-11-19T10:00', '2026-11-19T09:00', 'UTC')).toBeUndefined();
    expect(parseFormTimes(false, '', '2026-11-19T09:00', 'UTC')).toBeUndefined();
  });
  test('timed values are read in the form zone', () => {
    expect(parseFormTimes(false, '2026-11-19T09:00', '2026-11-19T10:00', 'Asia/Tehran')).toEqual({
      start: new Date('2026-11-19T05:30:00Z'),
      end: new Date('2026-11-19T06:30:00Z'),
    });
  });
});

describe('buildEditorResult', () => {
  test('a new timed event is saved in the form zone', () => {
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
  test('moving a timed event to another zone changes the series', () => {
    const timed = { ...occurrence, allDay: false, tz: 'Asia/Tehran' };
    const r = buildEditorResult(
      { kind: 'edit', occurrence: timed },
      input({ allDay: false, start: '2026-11-19T09:00', end: '2026-11-19T10:00', tz: 'Europe/London' }),
      ctx,
    );
    expect(r).toMatchObject({ seriesChanged: true, patch: { tz: 'Europe/London', start: '2026-11-19T09:00:00.000Z' } });
  });
  test('backwards times come back as an error', () => {
    expect(buildEditorResult(edit, input({ start: '2026-11-20', end: '2026-11-19' }), ctx)).toBe('endBeforeStart');
  });
});

test('new events start at the next whole hour on the shown day', () => {
  const slot = newEventSlot(new Date('2026-11-21T00:00:00Z'), new Date('2026-11-19T14:20:00Z'));
  expect(slot).toEqual({ start: new Date('2026-11-21T15:00:00Z'), end: new Date('2026-11-21T16:00:00Z') });
});
