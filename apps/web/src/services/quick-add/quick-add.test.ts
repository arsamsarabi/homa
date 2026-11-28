import { describe, expect, test } from 'bun:test';
import { parseQuickAdd, previewOf, quickAddBody } from './quick-add';

const ctx = { now: new Date('2026-11-20T10:00:00Z'), tz: 'Europe/London', weekStart: 1 };
const f = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' });
const formats = {
  date: f({ weekday: 'short', day: 'numeric', month: 'short' }),
  time: f({ hour: 'numeric', minute: '2-digit' }),
  weekday: f({ weekday: 'short' }),
  locale: 'en-GB',
};

describe('quickAddBody', () => {
  test('a timed event keeps the zone it was read in', () => {
    const body = quickAddBody(parseQuickAdd('Dentist tue 3pm 45m', ctx), 'c1', ctx.tz);
    expect(body).toEqual({
      summary: 'Dentist',
      description: null,
      location: null,
      start: '2026-11-24T15:00:00.000Z',
      end: '2026-11-24T15:45:00.000Z',
      calendarId: 'c1',
      allDay: false,
      tz: 'Europe/London',
      rrule: null,
    });
  });

  test('an all-day event is in UTC', () => {
    const body = quickAddBody(parseQuickAdd('Holiday 3-7 Dec', ctx), 'c1', ctx.tz);
    expect(body).toMatchObject({
      allDay: true,
      tz: 'UTC',
      start: '2026-12-03T00:00:00.000Z',
      end: '2026-12-08T00:00:00.000Z',
    });
  });
});

describe('previewOf', () => {
  test('a timed event shows its day, times and length', () => {
    const p = previewOf(parseQuickAdd('Dentist tue 3pm 45m', ctx), ctx.tz, formats);
    // ICU decides the spacing around the range dash.
    expect(p.when).toMatch(/^Tue 24 Nov, 15:00\s*–\s*15:45$/);
    expect(p.length).toMatch(/^45 mins?$/); // ICU versions differ on the unit name
    expect(p).toMatchObject({
      rrule: null,
      weekdays: [],
      defaulted: false,
    });
  });

  test('a range of days shows the first and last day', () => {
    const p = previewOf(parseQuickAdd('Holiday 3-7 Dec', ctx), ctx.tz, formats);
    expect(p.when).toMatch(/^Thu 3( Dec)? – Mon 7 Dec$/);
    expect(p.length).toBeUndefined();
  });

  test('a weekly rule on set days names them', () => {
    const p = previewOf(parseQuickAdd('Gym every mon, wed and fri 7am', ctx), ctx.tz, formats);
    expect(p.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(p.weekdays).toEqual(['Mon', 'Wed', 'Fri']);
  });

  test('an event across midnight shows both days', () => {
    const p = previewOf(parseQuickAdd('Night out tomorrow 10pm-1am', ctx), ctx.tz, formats);
    expect(p.when).toMatch(/^Sat 21 Nov, 22:00 – Sun 22 Nov, 0?1:00$/);
    expect(p.length).toMatch(/^3 hrs?$/);
  });

  test('says when no date was found', () => {
    expect(previewOf(parseQuickAdd('buy milk', ctx), ctx.tz, formats).defaulted).toBe(true);
  });
});
