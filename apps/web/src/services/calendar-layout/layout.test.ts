import { describe, expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { instantOf } from '@/services/zones';
import { agendaGroups, allDayRowItems, busyDates, layoutColumns, monthCellItems, timedColumnItems } from './layout';

const occ = (summary: string, start: string, end: string, allDay = false): Occurrence => ({
  eventId: summary,
  calendarId: 'c1',
  recurrenceId: start,
  start,
  end,
  summary,
  description: null,
  location: null,
  allDay,
  tz: 'UTC',
  recurring: false,
  overridden: false,
  taskId: null,
  taskDone: false,
  createdBy: null,
  travelMinutes: null,
});
// Shown in Tehran (UTC+3:30), so a UTC-only bug would put things on the wrong day.
const TZ = 'Asia/Tehran';
const local = (d: number, h: number, m = 0): string =>
  instantOf(new Date(Date.UTC(2026, 10, d, h, m)), TZ).toISOString();
const day = (d: number): Date => new Date(Date.UTC(2026, 10, d));
const days = [day(19), day(20)];
const items = [
  occ('Lunch', local(19, 12, 30), local(19, 13, 30)),
  occ('Review', local(19, 13), local(19, 14)),
  occ('Birthday', '2026-11-20T00:00:00Z', '2026-11-21T00:00:00Z', true),
  occ('Trip', local(19, 18), local(20, 20)),
];

test('overlapping events share the width', () => {
  const at = (h: number, m = 0): Date => new Date(Date.UTC(2026, 10, 19, h, m));
  const placed = layoutColumns([
    { id: 'a', start: at(9), end: at(10) },
    { id: 'b', start: at(9, 30), end: at(11) },
    { id: 'c', start: at(10), end: at(10, 30) },
    { id: 'd', start: at(12), end: at(13) },
  ]);
  const by = Object.fromEntries(placed.map((p) => [p.id, [p.col, p.cols]]));
  expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
});

describe('time grid', () => {
  test('all-day and day-long events go in the all-day row', () => {
    expect(allDayRowItems(days, items, TZ).map((d) => d.map((o) => o.summary))).toEqual([
      ['Trip'],
      ['Birthday', 'Trip'],
    ]);
  });
  test('timed events are placed per day', () => {
    const cols = timedColumnItems(days, items, TZ);
    expect(cols[0]?.map((p) => [p.o.summary, p.col, p.cols])).toEqual([
      ['Lunch', 0, 2],
      ['Review', 1, 2],
    ]);
    expect(cols[1]).toEqual([]);
  });
  test('travel time sits before the event and counts as overlap', () => {
    const drive = { ...occ('Dentist', '2026-11-19T10:00:00Z', '2026-11-19T11:00:00Z'), travelMinutes: 30 };
    const before = occ('Call', '2026-11-19T09:00:00Z', '2026-11-19T09:45:00Z');
    const col = timedColumnItems(days, [before, drive], 'UTC')[0] ?? [];
    expect(col.map((p) => [p.o.summary, p.col, p.cols])).toEqual([
      ['Call', 0, 2],
      ['Dentist', 1, 2],
    ]);
    expect(col[1]?.travelStart.toISOString()).toBe('2026-11-19T09:30:00.000Z');
    expect(col[0]?.travelStart).toEqual(col[0]?.start);
  });
});

test('month cells list all-day events first', () => {
  expect(monthCellItems(days, items, TZ)[1]?.map((o) => o.summary)).toEqual(['Birthday', 'Trip']);
});

test('busy dates cover every day an event touches', () => {
  expect([...busyDates(items, TZ)].sort()).toEqual(['2026-11-19', '2026-11-20']);
});

test('the agenda skips empty days', () => {
  const groups = agendaGroups([...days, day(25)], items, TZ);
  expect(groups.map((g) => g.day.getUTCDate())).toEqual([19, 20]);
});
