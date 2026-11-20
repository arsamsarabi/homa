import { describe, expect, test } from 'bun:test';
import { parseQuickAdd, type QuickAddContext } from './parse';

// Friday 20 November 2026, 10:00 in London (GMT, so wall time = UTC).
const LONDON: QuickAddContext = { now: new Date('2026-11-20T10:00:00Z'), tz: 'Europe/London', weekStart: 1 };

type Want = { title: string; start: string; end: string; allDay?: boolean; rrule?: string; defaulted?: boolean };
type Row = [text: string, want: Want, ctx?: Partial<QuickAddContext>];

const z = (s: string): string => `${s}:00.000Z`;
const day = (s: string): string => `${s}T00:00:00.000Z`;

const ENGLISH: Row[] = [
  ['Dentist tue 3pm 45m', { title: 'Dentist', start: z('2026-11-24T15:00'), end: z('2026-11-24T15:45') }],
  [
    'Lunch with Sara tomorrow 1-2pm',
    { title: 'Lunch with Sara', start: z('2026-11-21T13:00'), end: z('2026-11-21T14:00') },
  ],
  [
    'Team sync every Monday 10am',
    { title: 'Team sync', start: z('2026-11-23T10:00'), end: z('2026-11-23T11:00'), rrule: 'FREQ=WEEKLY' },
  ],
  ['Holiday 3-7 Dec', { title: 'Holiday', start: day('2026-12-03'), end: day('2026-12-08'), allDay: true }],
  ['Holiday Dec 3 - 7', { title: 'Holiday', start: day('2026-12-03'), end: day('2026-12-08'), allDay: true }],
  ['call mum in 2 hours', { title: 'call mum', start: z('2026-11-20T12:00'), end: z('2026-11-20T13:00') }],
  ['stretch in 30 mins for 10m', { title: 'stretch', start: z('2026-11-20T10:30'), end: z('2026-11-20T10:40') }],
  ['tea in half an hour', { title: 'tea', start: z('2026-11-20T10:30'), end: z('2026-11-20T11:30') }],
  ['flight 23 Dec 06:40 for 3h', { title: 'flight', start: z('2026-12-23T06:40'), end: z('2026-12-23T09:40') }],
  [
    'Flight December 23rd 2027 at 6:40am',
    { title: 'Flight', start: z('2027-12-23T06:40'), end: z('2027-12-23T07:40') },
  ],
  // A date that has passed this year is next year's.
  ['Anniversary 3 March', { title: 'Anniversary', start: day('2027-03-03'), end: day('2027-03-04'), allDay: true }],
  ['meeting 2026-12-01 10:00-11:30', { title: 'meeting', start: z('2026-12-01T10:00'), end: z('2026-12-01T11:30') }],
  ['Workshop 9am to 5:30pm tomorrow', { title: 'Workshop', start: z('2026-11-21T09:00'), end: z('2026-11-21T17:30') }],
  ['Brunch tomorrow 11-1pm', { title: 'Brunch', start: z('2026-11-21T11:00'), end: z('2026-11-21T13:00') }],
  ['Night out tomorrow 10pm-1am', { title: 'Night out', start: z('2026-11-21T22:00'), end: z('2026-11-22T01:00') }],
  // A time with no date: today if it is still ahead, else tomorrow.
  ['Standup 9:30', { title: 'Standup', start: z('2026-11-21T09:30'), end: z('2026-11-21T10:30') }],
  ['Coffee 11am', { title: 'Coffee', start: z('2026-11-20T11:00'), end: z('2026-11-20T12:00') }],
  // A bare weekday is the coming one; today counts while its time is ahead.
  ['Review fri 4pm', { title: 'Review', start: z('2026-11-20T16:00'), end: z('2026-11-20T17:00') }],
  ['Review fri 9am', { title: 'Review', start: z('2026-11-27T09:00'), end: z('2026-11-27T10:00') }],
  ['dinner sat 7pm', { title: 'dinner', start: z('2026-11-21T19:00'), end: z('2026-11-21T20:00') }],
  // "at 1" to "at 7" are afternoon and evening; "at 9" is morning.
  ['dinner on saturday at 7', { title: 'dinner', start: z('2026-11-21T19:00'), end: z('2026-11-21T20:00') }],
  ['gym tomorrow at 9', { title: 'gym', start: z('2026-11-21T09:00'), end: z('2026-11-21T10:00') }],
  ['lunch tomorrow at noon', { title: 'lunch', start: z('2026-11-21T12:00'), end: z('2026-11-21T13:00') }],
  ['run tomorrow morning', { title: 'run', start: z('2026-11-21T09:00'), end: z('2026-11-21T10:00') }],
  ['party tonight', { title: 'party', start: z('2026-11-20T20:00'), end: z('2026-11-20T21:00') }],
  ['party tonight 9:30pm', { title: 'party', start: z('2026-11-20T21:30'), end: z('2026-11-20T22:30') }],
  ['Pay rent in 3 days', { title: 'Pay rent', start: day('2026-11-23'), end: day('2026-11-24'), allDay: true }],
  [
    'Pay rent day after tomorrow',
    { title: 'Pay rent', start: day('2026-11-22'), end: day('2026-11-23'), allDay: true },
  ],
  ['Plan next week', { title: 'Plan', start: day('2026-11-23'), end: day('2026-11-24'), allDay: true }],
  // A date with a length but no time starts at 09:00.
  ['Dentist tomorrow 45m', { title: 'Dentist', start: z('2026-11-21T09:00'), end: z('2026-11-21T09:45') }],
  ['Interview tue 2pm 1h30', { title: 'Interview', start: z('2026-11-24T14:00'), end: z('2026-11-24T15:30') }],
  ['Interview tue 2pm for an hour', { title: 'Interview', start: z('2026-11-24T14:00'), end: z('2026-11-24T15:00') }],
  ['Review in a week', { title: 'Review', start: day('2026-11-27'), end: day('2026-11-28'), allDay: true }],
  ['Trip 3 to 7 December 2027', { title: 'Trip', start: day('2027-12-03'), end: day('2027-12-08'), allDay: true }],
  ['Call for half an hour tomorrow 4pm', { title: 'Call', start: z('2026-11-21T16:00'), end: z('2026-11-21T16:30') }],
  // Repeats.
  [
    'Gym every mon, wed and fri 7am',
    { title: 'Gym', start: z('2026-11-23T07:00'), end: z('2026-11-23T08:00'), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' },
  ],
  [
    'Standup every weekday 9:15 15m',
    {
      title: 'Standup',
      start: z('2026-11-23T09:15'),
      end: z('2026-11-23T09:30'),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    },
  ],
  [
    'Water plants every other day',
    {
      title: 'Water plants',
      start: day('2026-11-20'),
      end: day('2026-11-21'),
      allDay: true,
      rrule: 'FREQ=DAILY;INTERVAL=2',
    },
  ],
  [
    'Review every 2 weeks fri 3pm',
    { title: 'Review', start: z('2026-11-20T15:00'), end: z('2026-11-20T16:00'), rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  ],
  [
    'Birthday 3 Dec yearly',
    { title: 'Birthday', start: day('2026-12-03'), end: day('2026-12-04'), allDay: true, rrule: 'FREQ=YEARLY' },
  ],
  [
    'Book club monthly tomorrow 7pm',
    { title: 'Book club', start: z('2026-11-21T19:00'), end: z('2026-11-21T20:00'), rrule: 'FREQ=MONTHLY' },
  ],
  // "remind me" is taken off the title (the Phase 4a hook).
  ['remind me to call mum at 5pm', { title: 'call mum', start: z('2026-11-20T17:00'), end: z('2026-11-20T18:00') }],
  // Nothing said when: the next whole hour.
  ['buy milk', { title: 'buy milk', start: z('2026-11-20T11:00'), end: z('2026-11-20T12:00'), defaulted: true }],
  ['', { title: '', start: z('2026-11-20T11:00'), end: z('2026-11-20T12:00'), defaulted: true }],
  // Only the first date counts; what can't be read stays in the title.
  ['Trip 3 Dec or 5 Dec', { title: 'Trip or 5 Dec', start: day('2026-12-03'), end: day('2026-12-04'), allDay: true }],
  ['Call 31 Feb', { title: 'Call 31 Feb', start: z('2026-11-20T11:00'), end: z('2026-11-20T12:00'), defaulted: true }],
  ['Room 25 meeting 3pm', { title: 'Room 25 meeting', start: z('2026-11-20T15:00'), end: z('2026-11-20T16:00') }],
  [
    'Monday.com demo thursday 2pm',
    { title: 'Monday.com demo', start: z('2026-11-26T14:00'), end: z('2026-11-26T15:00') },
  ],
];

const FARSI: Row[] = [
  ['دندانپزشکی فردا ساعت ۳ عصر', { title: 'دندانپزشکی', start: z('2026-11-21T15:00'), end: z('2026-11-21T16:00') }],
  ['ناهار پس‌فردا ۱ تا ۲ ظهر', { title: 'ناهار', start: z('2026-11-22T13:00'), end: z('2026-11-22T14:00') }],
  ['ناهار پس فردا ساعت ۱۳:۳۰', { title: 'ناهار', start: z('2026-11-22T13:30'), end: z('2026-11-22T14:30') }],
  // Arabic-Indic digits and the Arabic yeh.
  ['جلسه يکشنبه ٣ عصر', { title: 'جلسه', start: z('2026-11-22T15:00'), end: z('2026-11-22T16:00') }],
  ['جلسه سه شنبه ساعت ۱۰ صبح', { title: 'جلسه', start: z('2026-11-24T10:00'), end: z('2026-11-24T11:00') }],
  ['جلسه سه‌شنبه ساعت ۸ شب', { title: 'جلسه', start: z('2026-11-24T20:00'), end: z('2026-11-24T21:00') }],
  // "X بعد" is that day next week (the week starts on the setting's day).
  [
    'کلاس شنبه بعد ساعت ۱۸:۳۰ به مدت ۹۰ دقیقه',
    { title: 'کلاس', start: z('2026-11-28T18:30'), end: z('2026-11-28T20:00') },
  ],
  [
    'کلاس شنبه بعد ۹ صبح',
    { title: 'کلاس', start: z('2026-11-21T09:00'), end: z('2026-11-21T10:00') },
    { weekStart: 6 },
  ],
  ['ورزش امروز عصر', { title: 'ورزش', start: z('2026-11-20T17:00'), end: z('2026-11-20T18:00') }],
  ['مهمانی امشب', { title: 'مهمانی', start: z('2026-11-20T20:00'), end: z('2026-11-20T21:00') }],
  ['شام فردا شب نیم ساعت', { title: 'شام', start: z('2026-11-21T20:00'), end: z('2026-11-21T20:30') }],
  ['زنگ به مامان ۲ ساعت دیگه', { title: 'زنگ به مامان', start: z('2026-11-20T12:00'), end: z('2026-11-20T13:00') }],
  ['قبض ۳ روز دیگر', { title: 'قبض', start: day('2026-11-23'), end: day('2026-11-24'), allDay: true }],
  // "ساعت ۳" with no part of the day reads 1 to 7 as the afternoon, as "at 3" does.
  ['جلسه فردا ساعت ۳', { title: 'جلسه', start: z('2026-11-21T15:00'), end: z('2026-11-21T16:00') }],
  ['جلسه فردا ساعت ۳ تا ۵', { title: 'جلسه', start: z('2026-11-21T15:00'), end: z('2026-11-21T17:00') }],
  // Today is a Friday and 21:00 is still ahead.
  ['دورهمی جمعه ۹ تا ۱۱ شب', { title: 'دورهمی', start: z('2026-11-20T21:00'), end: z('2026-11-20T23:00') }],
  ['مطالعه فردا ۴۵ دقیقه', { title: 'مطالعه', start: z('2026-11-21T09:00'), end: z('2026-11-21T09:45') }],
  // Jalali dates: 15 Azar 1405 is 6 December 2026, and 1 Farvardin 1406 is 21 March 2027.
  ['تولد ۱۵ آذر', { title: 'تولد', start: day('2026-12-06'), end: day('2026-12-07'), allDay: true }],
  ['تولد ۱۵ آذر ۱۴۰۶', { title: 'تولد', start: day('2027-12-06'), end: day('2027-12-07'), allDay: true }],
  ['نوروز ۱ فروردین', { title: 'نوروز', start: day('2027-03-21'), end: day('2027-03-22'), allDay: true }],
  // 1 Aban 1405 (23 October 2026) has passed, so it's 1 Aban 1406.
  ['سالگرد ۱ آبان', { title: 'سالگرد', start: day('2027-10-23'), end: day('2027-10-24'), allDay: true }],
  ['سفر ۳ تا ۷ دی', { title: 'سفر', start: day('2026-12-24'), end: day('2026-12-29'), allDay: true }],
  ['جلسه ۱۰ دی ساعت ۹ صبح', { title: 'جلسه', start: z('2026-12-31T09:00'), end: z('2026-12-31T10:00') }],
  // Mehr has 30 days: no such date, so it stays in the title.
  ['جلسه ۳۱ مهر', { title: 'جلسه ۳۱ مهر', start: z('2026-11-20T11:00'), end: z('2026-11-20T12:00'), defaulted: true }],
  [
    'بک‌آپ هر ۲ هفته جمعه ۲ عصر',
    { title: 'بک‌آپ', start: z('2026-11-20T14:00'), end: z('2026-11-20T15:00'), rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  ],
  ['انتشار فردا نیمه‌شب', { title: 'انتشار', start: z('2026-11-21T00:00'), end: z('2026-11-21T01:00') }],
  // Repeats.
  [
    'جلسه هر دوشنبه ساعت ۱۰ صبح',
    { title: 'جلسه', start: z('2026-11-23T10:00'), end: z('2026-11-23T11:00'), rrule: 'FREQ=WEEKLY' },
  ],
  [
    'ورزش هر شنبه و چهارشنبه ۷ صبح',
    { title: 'ورزش', start: z('2026-11-21T07:00'), end: z('2026-11-21T08:00'), rrule: 'FREQ=WEEKLY;BYDAY=SA,WE' },
  ],
  [
    'دارو هر روز ساعت ۸ صبح',
    { title: 'دارو', start: z('2026-11-21T08:00'), end: z('2026-11-21T09:00'), rrule: 'FREQ=DAILY' },
  ],
  [
    'گزارش هر هفته جمعه ۲ عصر',
    { title: 'گزارش', start: z('2026-11-20T14:00'), end: z('2026-11-20T15:00'), rrule: 'FREQ=WEEKLY' },
  ],
  [
    'یادم بنداز که فردا ۵ عصر زنگ بزنم',
    { title: 'زنگ بزنم', start: z('2026-11-21T17:00'), end: z('2026-11-21T18:00') },
  ],
  ['خرید نان', { title: 'خرید نان', start: z('2026-11-20T11:00'), end: z('2026-11-20T12:00'), defaulted: true }],
];

const WEEK_START: Row[] = [
  // "next" is the day in the next week, which depends on where weeks start. Today is a Friday.
  [
    'Brunch next sunday',
    { title: 'Brunch', start: day('2026-11-29'), end: day('2026-11-30'), allDay: true },
    { weekStart: 1 },
  ],
  [
    'Brunch next sunday',
    { title: 'Brunch', start: day('2026-11-22'), end: day('2026-11-23'), allDay: true },
    { weekStart: 0 },
  ],
  [
    'Brunch next sunday',
    { title: 'Brunch', start: day('2026-11-22'), end: day('2026-11-23'), allDay: true },
    { weekStart: 6 },
  ],
  [
    'Market next saturday',
    { title: 'Market', start: day('2026-11-21'), end: day('2026-11-22'), allDay: true },
    { weekStart: 6 },
  ],
  [
    'Market next saturday',
    { title: 'Market', start: day('2026-11-28'), end: day('2026-11-29'), allDay: true },
    { weekStart: 1 },
  ],
  ['Standup next monday 9:30', { title: 'Standup', start: z('2026-11-23T09:30'), end: z('2026-11-23T10:30') }],
  [
    'Plan next week',
    { title: 'Plan', start: day('2026-11-22'), end: day('2026-11-23'), allDay: true },
    { weekStart: 0 },
  ],
  [
    'برنامه‌ریزی هفته بعد',
    { title: 'برنامه‌ریزی', start: day('2026-11-21'), end: day('2026-11-22'), allDay: true },
    { weekStart: 6 },
  ],
];

// Home zones: times are said in the zone, and "today" is the zone's today.
const ZONES: Row[] = [
  // Tehran is UTC+3:30 with no daylight saving.
  [
    'Dentist tomorrow 9am',
    { title: 'Dentist', start: z('2026-11-21T05:30'), end: z('2026-11-21T06:30') },
    { tz: 'Asia/Tehran' },
  ],
  // 22:00 UTC is already 01:30 on the 21st in Tehran, so "tomorrow" is the 22nd.
  [
    'Dentist tomorrow 9am',
    { title: 'Dentist', start: z('2026-11-22T05:30'), end: z('2026-11-22T06:30') },
    { tz: 'Asia/Tehran', now: new Date('2026-11-20T22:00:00Z') },
  ],
  ['Call 3pm', { title: 'Call', start: z('2026-11-20T20:00'), end: z('2026-11-20T21:00') }, { tz: 'America/New_York' }],
  [
    'Holiday 3-7 Dec',
    { title: 'Holiday', start: day('2026-12-03'), end: day('2026-12-08'), allDay: true },
    { tz: 'Pacific/Auckland' },
  ],
  // The default slot is the zone's next whole hour (Kolkata is UTC+5:30: 15:30 now, so 16:00).
  [
    'buy milk',
    { title: 'buy milk', start: z('2026-11-20T10:30'), end: z('2026-11-20T11:30'), defaulted: true },
    { tz: 'Asia/Kolkata' },
  ],
];

// Daylight saving in London: clocks go forward at 01:00 GMT on 28 March 2027 and back at 02:00 BST
// on 31 October 2027. "Now" is the Saturday before each, at noon UTC.
const SPRING = { now: new Date('2027-03-27T12:00:00Z') };
const AUTUMN = { now: new Date('2027-10-30T12:00:00Z') };
const DST: Row[] = [
  ['Brunch tomorrow 11am', { title: 'Brunch', start: z('2027-03-28T10:00'), end: z('2027-03-28T11:00') }, SPRING],
  // 01:30 doesn't exist that night; it moves on by the gap to 02:30 BST.
  ['Feed cat tomorrow 1:30am', { title: 'Feed cat', start: z('2027-03-28T01:30'), end: z('2027-03-28T02:30') }, SPRING],
  // A length is elapsed time: 23:00 GMT plus 3 hours is 03:00 BST.
  ['Party tonight 11pm for 3h', { title: 'Party', start: z('2027-03-27T23:00'), end: z('2027-03-28T02:00') }, SPRING],
  // An end time is a wall time: 22:00 GMT to 06:00 BST is 7 hours.
  [
    'Night shift tonight 10pm-6am',
    { title: 'Night shift', start: z('2027-03-27T22:00'), end: z('2027-03-28T05:00') },
    SPRING,
  ],
  ['Call in 14 hours', { title: 'Call', start: z('2027-03-28T02:00'), end: z('2027-03-28T03:00') }, SPRING],
  [
    'Run every sunday 8am',
    { title: 'Run', start: z('2027-03-28T07:00'), end: z('2027-03-28T08:00'), rrule: 'FREQ=WEEKLY' },
    SPRING,
  ],
  // 01:30 happens twice; it's the first one (BST).
  ['Feed cat tomorrow 1:30am', { title: 'Feed cat', start: z('2027-10-31T00:30'), end: z('2027-10-31T01:30') }, AUTUMN],
  ['Brunch tomorrow 11am', { title: 'Brunch', start: z('2027-10-31T11:00'), end: z('2027-10-31T12:00') }, AUTUMN],
  [
    'Clocks change sunday',
    { title: 'Clocks change', start: day('2027-10-31'), end: day('2027-11-01'), allDay: true },
    AUTUMN,
  ],
];

function check(rows: Row[]): void {
  // A rest parameter, so bun doesn't take the third argument for a done callback.
  test.each(rows)('%s', (...[text, want, ctx]: Row) => {
    const got = parseQuickAdd(text, { ...LONDON, ...ctx });
    expect({
      title: got.title,
      start: got.start.toISOString(),
      end: got.end.toISOString(),
      allDay: got.allDay,
      rrule: got.rrule,
      defaulted: got.defaulted,
    }).toEqual({ allDay: false, defaulted: false, ...want, rrule: want.rrule ?? null });
  });
}

describe('quick add, English', () => check(ENGLISH));
describe('quick add, Farsi', () => check(FARSI));
describe('quick add, week start', () => check(WEEK_START));
describe('quick add, home zone', () => check(ZONES));
describe('quick add, daylight saving', () => check(DST));

describe('quick add, reminders hook', () => {
  test('marks "remind me" lines', () => {
    expect(parseQuickAdd('remind me to call mum at 5pm', LONDON).reminder).toBe(true);
    expect(parseQuickAdd('یادم بنداز فردا نان بخرم', LONDON).reminder).toBe(true);
    expect(parseQuickAdd('call mum at 5pm', LONDON).reminder).toBe(false);
  });
});
