// Words and patterns the quick-add parser knows, in English and Farsi. See
// docs/design/phase-4c-quick-add.md for the grammar they make up.

/**
 * A copy of `text` that is easier to match, with every character in the same place (so a match
 * maps straight back onto the original): Persian and Arabic-Indic digits become 0-9, Arabic yeh
 * and kaf become their Persian forms, the zero-width non-joiner becomes a space, dashes become "-",
 * and Latin letters are lowercased.
 */
export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    let c = ch;
    if (code >= 0x06f0 && code <= 0x06f9) c = String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) c = String(code - 0x0660);
    else if (ch === 'ي') c = 'ی';
    else if (ch === 'ك') c = 'ک';
    else if (ch === '‌') c = ' ';
    else if (ch === '–' || ch === '—') c = '-';
    else {
      const lower = ch.toLowerCase();
      if (lower.length === ch.length) c = lower;
    }
    // Every replacement above is one UTF-16 unit for one, so offsets stay the same.
    out += c.length === ch.length ? c : ch;
  }
  return out;
}

/** Start and end of a word: no letter or digit right before or after, nor a dotted one ("Monday.com"). */
export const B = '(?<![\\p{L}\\p{N}]|[\\p{L}\\p{N}]\\.)';
export const E = '(?![\\p{L}\\p{N}]|\\.[\\p{L}\\p{N}])';

/** 0 = Sunday … 6 = Saturday, as Date.getUTCDay counts. */
export const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

// English weekdays, full and short.
export const EN_WEEKDAY =
  'sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat';
const EN_WEEKDAY_INDEX: Readonly<Record<string, number>> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export const enWeekday = (word: string): number | undefined => EN_WEEKDAY_INDEX[word.slice(0, 3)];

export const EN_MONTH =
  'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** 1 = January. */
export const enMonth = (word: string): number => EN_MONTHS.indexOf(word.slice(0, 3)) + 1;

// Farsi weekdays, longest first so "یک شنبه" isn't read as "شنبه". Spaces between the parts are
// optional (the non-joiner is a space after normalize).
export const FA_WEEKDAY = 'یک\\s*شنبه|دو\\s*شنبه|سه\\s*شنبه|چهار\\s*شنبه|پنج\\s*شنبه|شنبه|جمعه';
const FA_WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  یکشنبه: 0,
  دوشنبه: 1,
  سهشنبه: 2,
  چهارشنبه: 3,
  پنجشنبه: 4,
  جمعه: 5,
  شنبه: 6,
};
export const faWeekday = (word: string): number | undefined => FA_WEEKDAY_INDEX[word.replace(/\s+/g, '')];

/** Jalali months, 1 = Farvardin. "امرداد" is another spelling of Mordad. */
const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];
export const JALALI_MONTH = `امرداد|${JALALI_MONTHS.join('|')}`;
export const jalaliMonth = (word: string): number => (word === 'امرداد' ? 5 : JALALI_MONTHS.indexOf(word) + 1);

/** Farsi parts of the day that follow an hour ("۳ عصر") or stand alone ("فردا صبح"). */
export const FA_PART = 'صبح|ظهر|بعد\\s*از\\s*ظهر|عصر|شب';

/** The 24-hour hour for `h` said with a Farsi part of the day. */
export function faHour(h: number, part: string): number {
  const p = part.replace(/\s+/g, '');
  if (p === 'صبح') return h === 12 ? 0 : h;
  if (p === 'ظهر') return h < 7 ? h + 12 : h; // "۱ ظهر" is 13:00, "۱۲ ظهر" noon
  if (p === 'شب') return h === 12 ? 0 : h >= 5 && h < 12 ? h + 12 : h; // "۲ شب" is 2 at night
  return h < 12 ? h + 12 : h; // عصر, بعدازظهر
}

/** Minutes after midnight that a part of the day alone means ("tomorrow morning", "فردا عصر"). */
export const PART_ALONE: Readonly<Record<string, number>> = {
  morning: 9 * 60,
  afternoon: 14 * 60,
  evening: 18 * 60,
  tonight: 20 * 60,
  صبح: 9 * 60,
  ظهر: 12 * 60,
  بعدازظهر: 14 * 60,
  عصر: 17 * 60,
  شب: 20 * 60,
};

/** An hour said with no am or pm ("at 3", "ساعت ۳"): 1 to 7 mean the afternoon or evening. */
export const bareHour = (h: number): number => (h >= 1 && h <= 7 ? h + 12 : h);

/** "an", "a", "یک" and "نیم" (half) as numbers, else the digits. */
export function amount(word: string): number {
  if (word === 'a' || word === 'an' || word === 'یک') return 1;
  if (word === 'نیم') return 0.5;
  return Number(word);
}
