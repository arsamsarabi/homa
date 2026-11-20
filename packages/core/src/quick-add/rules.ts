// The quick-add grammar: each rule is a pattern and what a match means. Rules run in order over
// the normalized text, and a rule only takes a match it can use (a second date, say, is left in the
// title). See docs/design/phase-4c-quick-add.md.
import { fromJalali, jalaliDate } from '../time';
import {
  amount,
  B,
  bareHour,
  E,
  EN_MONTH,
  EN_WEEKDAY,
  enMonth,
  enWeekday,
  FA_PART,
  FA_WEEKDAY,
  faHour,
  faWeekday,
  JALALI_MONTH,
  jalaliMonth,
  PART_ALONE,
} from './lexicon';

const DAY = 86_400_000;
const MINUTE = 60_000;

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** What the rules found. Dates are wall midnights; times are minutes after midnight. */
export type Facts = {
  date?: Date;
  /** The last day of a range like "3-7 Dec" (inclusive). */
  endDate?: Date;
  weekday?: { day: number; next: boolean };
  time?: number;
  endTime?: number;
  /** A time used only when none is given ("tonight" is 20:00 unless a time is said). */
  defaultTime?: number;
  durationMin?: number;
  /** "in 2 hours": the start is now plus this. */
  relativeMs?: number;
  repeat?: { freq: Freq; interval: number; byDay: number[] };
  /** "remind me …" (a hook for Phase 4a reminders). */
  reminder?: boolean;
};

export type RuleContext = { today: Date; weekStart: number };

type Rule = { re: RegExp; apply: (m: RegExpMatchArray, f: Facts, c: RuleContext) => boolean };

const rule = (source: string, apply: Rule['apply']): Rule => ({ re: new RegExp(`${B}(?:${source})${E}`, 'gu'), apply });

const ORD = '(?:st|nd|rd|th)?';
const AMPM = '(am|pm|a\\.m\\.|p\\.m\\.)';
const UNIT_H = 'hours?|hrs?|h';
const UNIT_M = 'minutes?|mins?|m';
const LATER = '(?:دیگه|دیگر|بعد)';

const utc = (y: number, m: number, d: number): Date | undefined => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : undefined;
};

/** The Gregorian date, this year or (when that has passed and no year was said) next year. */
function gregorian(c: RuleContext, month: number, day: number, year?: string): Date | undefined {
  if (year) return utc(Number(year), month, day);
  const y = c.today.getUTCFullYear();
  const d = utc(y, month, day);
  return d && d < c.today ? utc(y + 1, month, day) : d;
}

/** The Jalali date as a Gregorian wall date, this Jalali year or the next. */
function jalali(c: RuleContext, month: number, day: number, year?: string): Date | undefined {
  if (year) return fromJalali(Number(year), month, day);
  const y = jalaliDate(c.today).year;
  const d = fromJalali(y, month, day);
  return d && d < c.today ? fromJalali(y + 1, month, day) : d;
}

function setDate(f: Facts, date: Date | undefined, endDate?: Date): boolean {
  if (!date || f.date || f.weekday) return false;
  if (endDate && endDate < date) return false;
  f.date = date;
  if (endDate) f.endDate = endDate;
  return true;
}

function setRepeat(f: Facts, freq: Freq, interval = 1, byDay: number[] = []): boolean {
  if (f.repeat || !Number.isInteger(interval) || interval < 1) return false;
  f.repeat = { freq, interval, byDay };
  return true;
}

function setTime(f: Facts, h: number, min: number, endH?: number, endMin?: number): boolean {
  const ok = (hh: number, mm: number): boolean => hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
  if (f.time !== undefined || f.relativeMs !== undefined || !ok(h, min)) return false;
  if (endH !== undefined && !ok(endH, endMin ?? 0)) return false;
  f.time = h * 60 + min;
  if (endH !== undefined) f.endTime = endH * 60 + (endMin ?? 0);
  return true;
}

function setDuration(f: Facts, minutes: number): boolean {
  if (f.durationMin !== undefined || f.endTime !== undefined || !(minutes > 0) || minutes > 14 * 24 * 60) return false;
  f.durationMin = Math.round(minutes);
  return true;
}

/** 12-hour clock to 24-hour; undefined for an hour a 12-hour clock doesn't have. */
function h24(h: number, ampm: string): number | undefined {
  if (h < 1 || h > 12) return undefined;
  const pm = ampm.startsWith('p');
  return pm ? (h % 12) + 12 : h % 12;
}

const FREQ: Readonly<Record<string, Freq>> = {
  day: 'DAILY',
  daily: 'DAILY',
  week: 'WEEKLY',
  weekly: 'WEEKLY',
  month: 'MONTHLY',
  monthly: 'MONTHLY',
  year: 'YEARLY',
  yearly: 'YEARLY',
  annually: 'YEARLY',
  روز: 'DAILY',
  روزانه: 'DAILY',
  هفته: 'WEEKLY',
  هفتگی: 'WEEKLY',
  ماه: 'MONTHLY',
  ماهانه: 'MONTHLY',
  سال: 'YEARLY',
  سالانه: 'YEARLY',
};

const allWeekdays = (list: string, re: RegExp, read: (w: string) => number | undefined): number[] =>
  [...list.matchAll(re)].map((m) => read(m[0])).filter((d): d is number => d !== undefined);

export const RULES: readonly Rule[] = [
  // "remind me (to) …" / "یادم بنداز (که) …"
  rule('^\\s*(?:remind\\s+me(?:\\s+to)?|یادم\\s+(?:بنداز|بیار)(?:\\s+(?:که|تا))?)', (_m, f) => {
    f.reminder = true;
    return true;
  }),

  // Repeats.
  rule('every\\s+weekdays?', (_m, f) => setRepeat(f, 'WEEKLY', 1, [1, 2, 3, 4, 5])),
  rule(`every\\s+((?:${EN_WEEKDAY})s?(?:\\s*(?:,|and|&)\\s*(?:${EN_WEEKDAY})s?)*)`, (m, f) =>
    setRepeat(f, 'WEEKLY', 1, allWeekdays(m[1] ?? '', new RegExp(EN_WEEKDAY, 'gu'), enWeekday)),
  ),
  rule('every\\s+(?:(other)\\s+|(\\d+)\\s+)?(day|week|month|year)s?', (m, f) =>
    setRepeat(f, FREQ[m[3] ?? ''] ?? 'DAILY', m[1] ? 2 : m[2] ? Number(m[2]) : 1),
  ),
  rule('daily|weekly|monthly|yearly|annually|روزانه|هفتگی|ماهانه|سالانه', (m, f) =>
    setRepeat(f, FREQ[m[0]] ?? 'DAILY'),
  ),
  rule(`هر\\s+((?:${FA_WEEKDAY})(?:\\s*(?:،|,|و)\\s*(?:${FA_WEEKDAY}))*)`, (m, f) =>
    setRepeat(f, 'WEEKLY', 1, allWeekdays(m[1] ?? '', new RegExp(FA_WEEKDAY, 'gu'), faWeekday)),
  ),
  rule('هر\\s+(?:(\\d+)\\s+)?(روز|هفته|ماه|سال)', (m, f) =>
    setRepeat(f, FREQ[m[2] ?? ''] ?? 'DAILY', m[1] ? Number(m[1]) : 1),
  ),

  // Relative: "in 2 hours", "in 3 days", "۲ ساعت دیگه", "۳ روز بعد".
  rule(`in\\s+half\\s+an\\s+hour|نیم\\s*ساعت\\s+${LATER}`, (_m, f) => setRelative(f, 30)),
  rule(`in\\s+(an?|\\d+(?:\\.\\d+)?)\\s*(${UNIT_H}|${UNIT_M})`, (m, f) =>
    setRelative(f, amount(m[1] ?? '') * (/^h/.test(m[2] ?? '') ? 60 : 1)),
  ),
  rule(`(یک|\\d+(?:\\.\\d+)?)\\s*(ساعت|دقیقه)\\s+${LATER}`, (m, f) =>
    setRelative(f, amount(m[1] ?? '') * (m[2] === 'ساعت' ? 60 : 1)),
  ),
  rule(`in\\s+(an?|\\d+)\\s+(days?|weeks?)|(یک|\\d+)\\s+(روز|هفته)\\s+${LATER}`, (m, f, c) => {
    const n = amount(m[1] ?? m[3] ?? '');
    const week = /^w|هفته/.test(m[2] ?? m[4] ?? '');
    return Number.isInteger(n) && setDate(f, new Date(c.today.getTime() + n * (week ? 7 : 1) * DAY));
  }),

  // Date ranges: "3-7 Dec", "Dec 3-7", "۳ تا ۷ آذر".
  rule(
    `(?:from\\s+)?(\\d{1,2})${ORD}\\s*(?:-|to|until|till)\\s*(\\d{1,2})${ORD}\\s+(${EN_MONTH})(?:,?\\s+(\\d{4}))?`,
    (m, f, c) => range(f, c, gregorian, enMonth(m[3] ?? ''), m[1], m[2], m[4]),
  ),
  rule(
    `(?:from\\s+)?(${EN_MONTH})\\s+(\\d{1,2})${ORD}\\s*(?:-|to|until|till)\\s*(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?`,
    (m, f, c) => range(f, c, gregorian, enMonth(m[1] ?? ''), m[2], m[3], m[4]),
  ),
  rule(`(?:از\\s+)?(\\d{1,2})\\s*(?:-|تا)\\s*(\\d{1,2})\\s*(${JALALI_MONTH})(?:\\s+(\\d{4}))?`, (m, f, c) =>
    range(f, c, jalali, jalaliMonth(m[3] ?? ''), m[1], m[2], m[4]),
  ),

  // Dates: "23 Dec", "December 23rd 2027", "2026-12-23", "۱۵ آذر", "۱۵ آذر ۱۴۰۵".
  rule(`(?:on\\s+)?(\\d{1,2})${ORD}(?:\\s+of)?\\s+(${EN_MONTH})(?:,?\\s+(\\d{4}))?`, (m, f, c) =>
    setDate(f, gregorian(c, enMonth(m[2] ?? ''), Number(m[1]), m[3])),
  ),
  rule(`(?:on\\s+)?(${EN_MONTH})\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?`, (m, f, c) =>
    setDate(f, gregorian(c, enMonth(m[1] ?? ''), Number(m[2]), m[3])),
  ),
  rule('(?:on\\s+)?(\\d{4})-(\\d{1,2})-(\\d{1,2})', (m, f) =>
    setDate(f, utc(Number(m[1]), Number(m[2]), Number(m[3]))),
  ),
  rule(`(\\d{1,2})\\s*(${JALALI_MONTH})(?:\\s+(\\d{4}))?`, (m, f, c) =>
    setDate(f, jalali(c, jalaliMonth(m[2] ?? ''), Number(m[1]), m[3])),
  ),

  // Day words.
  rule('(?:the\\s+)?day\\s+after\\s+tomorrow|پس\\s*فردا', (_m, f, c) => setDate(f, addDays(c.today, 2))),
  rule('tomorrow|tmrw|tmr|فردا', (_m, f, c) => setDate(f, addDays(c.today, 1))),
  rule('today|امروز', (_m, f, c) => setDate(f, c.today)),
  rule('tonight|امشب', (_m, f, c) => {
    if (!setDate(f, c.today)) return false;
    f.defaultTime = PART_ALONE.tonight;
    return true;
  }),
  rule(`next\\s+week|هفته\\s+(?:بعد|آینده|دیگه|دیگر)`, (_m, f, c) =>
    setDate(f, addDays(c.today, 7 - ((c.today.getUTCDay() - c.weekStart + 7) % 7))),
  ),

  // Weekdays: "tue", "on Friday", "next Monday", "سه‌شنبه", "دوشنبه بعد".
  rule(`(?:on\\s+)?(?:(this|next|coming)\\s+)?(${EN_WEEKDAY})`, (m, f) =>
    setWeekday(f, enWeekday(m[2] ?? ''), m[1] === 'next'),
  ),
  rule(`(?:این\\s+)?(${FA_WEEKDAY})(?:\\s+(بعد|آینده|دیگه|دیگر))?`, (m, f) =>
    setWeekday(f, faWeekday(m[1] ?? ''), m[2] !== undefined),
  ),

  // Time ranges: "1-2pm", "9am to 5:30pm", "10:00-11:30", "ساعت ۳ تا ۵", "۹ تا ۱۱ صبح".
  rule(
    `(?:from\\s+|at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*${AMPM}?\\s*(?:-|to|until|till)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${AMPM}?`,
    (m, f) => {
      const [, h1, m1, ap1, h2, m2, ap2] = m;
      if (!ap1 && !ap2 && (m1 === undefined || m2 === undefined)) return false;
      const endH = ap2 ? h24(Number(h2), ap2) : Number(h2);
      let startH = ap1 ? h24(Number(h1), ap1) : Number(h1);
      // "1-2pm": the start takes the end's half of the day, unless that puts it after the end ("11-1pm").
      if (!ap1 && ap2 && startH !== undefined) {
        const same = h24(startH, ap2);
        startH = same !== undefined && same * 60 + Number(m1 ?? 0) < (endH ?? 0) * 60 + Number(m2 ?? 0) ? same : startH;
      }
      if (startH === undefined || endH === undefined) return false;
      return setTime(f, startH, Number(m1 ?? 0), endH, Number(m2 ?? 0));
    },
  ),
  rule(
    `(?:از\\s+)?(ساعت\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(?:-|تا)\\s*(?:ساعت\\s+)?(\\d{1,2})(?::(\\d{2}))?(?:\\s*(${FA_PART}))?`,
    (m, f) => {
      const [, saat, h1, m1, h2, m2, part] = m;
      if (!saat && !part && (m1 === undefined || m2 === undefined)) return false;
      const read = (h: string | undefined): number =>
        part ? faHour(Number(h), part) : saat ? bareHour(Number(h)) : Number(h);
      const start = read(h1);
      let end = read(h2);
      if (end < start && end < 12 && end + 12 > start) end += 12; // "۱۰:۰۰ تا ۲:۰۰" is 10:00 to 14:00
      return setTime(f, start, Number(m1 ?? 0), end, Number(m2 ?? 0));
    },
  ),

  // Times: "۳ عصر", "ساعت ۸ صبح", "3pm", "06:40", "at 3", "ساعت ۳", "noon", "tomorrow morning".
  rule(`(?:ساعت\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(${FA_PART})`, (m, f) =>
    setTime(f, faHour(Number(m[1]), m[3] ?? ''), Number(m[2] ?? 0)),
  ),
  rule(`(?:at\\s+|@\\s*)?(\\d{1,2})(?::(\\d{2}))?\\s*${AMPM}`, (m, f) => {
    const h = h24(Number(m[1]), m[3] ?? '');
    return h !== undefined && setTime(f, h, Number(m[2] ?? 0));
  }),
  rule('(?:at\\s+|@\\s*|ساعت\\s+)?(\\d{1,2}):(\\d{2})', (m, f) => setTime(f, Number(m[1]), Number(m[2]))),
  rule('(?:at\\s+)?(noon|midday|midnight)|نیمه\\s*شب', (m, f) =>
    setTime(f, m[1] === 'noon' || m[1] === 'midday' ? 12 : 0, 0),
  ),
  rule('(?:at\\s+|@\\s*|ساعت\\s+)(\\d{1,2})', (m, f) => setTime(f, bareHour(Number(m[1])), 0)),
  rule(`(?:in\\s+the\\s+)?(morning|afternoon|evening)|(${FA_PART})`, (m, f) => {
    const t = PART_ALONE[(m[1] ?? m[2] ?? '').replace(/\s+/g, '')];
    return t !== undefined && setTime(f, Math.floor(t / 60), t % 60);
  }),

  // Durations: "45m", "for 3h", "1h30", "2 hours", "for an hour", "۴۵ دقیقه", "به مدت ۲ ساعت", "نیم ساعت".
  rule(`(?:for\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT_H})(?:\\s*(\\d{1,2})\\s*(?:${UNIT_M})?)?`, (m, f) =>
    setDuration(f, Number(m[1]) * 60 + Number(m[2] ?? 0)),
  ),
  rule(`(?:for\\s+)?(\\d+)\\s*(?:${UNIT_M})`, (m, f) => setDuration(f, Number(m[1]))),
  rule('for\\s+(an?|half\\s+an?)\\s+hour', (m, f) => setDuration(f, m[1]?.startsWith('half') ? 30 : 60)),
  rule('(?:به\\s+مدت\\s+)?(نیم|یک|\\d+(?:\\.\\d+)?)\\s*(ساعت|دقیقه)', (m, f) =>
    setDuration(f, amount(m[1] ?? '') * (m[2] === 'ساعت' ? 60 : 1)),
  ),
];

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

function setRelative(f: Facts, minutes: number): boolean {
  if (f.relativeMs !== undefined || f.time !== undefined || !(minutes > 0)) return false;
  f.relativeMs = minutes * MINUTE;
  return true;
}

function setWeekday(f: Facts, day: number | undefined, next: boolean): boolean {
  if (day === undefined || f.date || f.weekday) return false;
  f.weekday = { day, next };
  return true;
}

function range(
  f: Facts,
  c: RuleContext,
  read: (c: RuleContext, month: number, day: number, year?: string) => Date | undefined,
  month: number,
  from: string | undefined,
  to: string | undefined,
  year: string | undefined,
): boolean {
  const first = Number(from);
  const last = Number(to);
  if (first < 1 || first >= last) return false;
  // The start is in the end's month, so the range is read from its last day.
  const end = read(c, month, last, year);
  return setDate(f, end && addDays(end, first - last), end);
}
