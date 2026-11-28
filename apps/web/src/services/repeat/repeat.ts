// Repeat rules the picker can show and build: every N days, weeks (on some weekdays), months or
// years. Anything else (COUNT, UNTIL, BYMONTHDAY, hourly rules and the like) is a "custom" rule the
// picker keeps as it is. Rules are RRULE values without the "RRULE:" prefix.

export const REPEAT_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

/** RRULE weekday codes, Sunday first, matching Date#getUTCDay. */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** Highest "every N": past this a rule is more likely a typo than a plan. */
export const MAX_REPEAT_EVERY = 999;

/** A rule the picker can show: every `every` `unit`s, and for weeks on `days` (empty: the start's weekday). */
export type SimpleRepeat = { every: number; unit: RepeatUnit; days: WeekdayCode[] };

const FREQ: Record<RepeatUnit, string> = { days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY' };
const UNIT_OF: Record<string, RepeatUnit> = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' };

const isWeekday = (d: string): d is WeekdayCode => (WEEKDAY_CODES as readonly string[]).includes(d);
const sortDays = (days: readonly WeekdayCode[]): WeekdayCode[] => WEEKDAY_CODES.filter((d) => days.includes(d));

/** The rule as a SimpleRepeat, null for none, or 'custom' when the picker can't show it. */
export function parseRepeat(rrule: string | null | undefined): SimpleRepeat | null | 'custom' {
  if (!rrule) return null;
  const parts = new Map<string, string>();
  for (const kv of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v, ...rest] = kv.split('=');
    if (!k || v === undefined || rest.length || parts.has(k.toUpperCase())) return 'custom';
    parts.set(k.toUpperCase(), v.toUpperCase());
  }
  const unit = UNIT_OF[parts.get('FREQ') ?? ''];
  if (!unit || [...parts.keys()].some((k) => !['FREQ', 'INTERVAL', 'BYDAY'].includes(k))) return 'custom';
  const interval = parts.get('INTERVAL') ?? '1';
  if (!/^\d{1,3}$/.test(interval) || Number(interval) < 1) return 'custom';
  const byDay = parts.get('BYDAY');
  if (byDay !== undefined && unit !== 'weeks') return 'custom';
  const days = byDay?.split(',') ?? [];
  if (!days.every(isWeekday)) return 'custom';
  return { every: Number(interval), unit, days: sortDays(days as WeekdayCode[]) };
}

/** The RRULE for a SimpleRepeat. A weekly rule on just the start's weekday leaves BYDAY out. */
export function repeatRule(r: SimpleRepeat, startDay?: WeekdayCode): string {
  const days = r.unit === 'weeks' ? sortDays(r.days) : [];
  const own = days.length === 1 && days[0] === startDay;
  return [
    `FREQ=${FREQ[r.unit]}`,
    ...(r.every > 1 ? [`INTERVAL=${r.every}`] : []),
    ...(days.length && !own ? [`BYDAY=${days.join(',')}`] : []),
  ].join(';');
}

/** The picker's presets: none, every day, week, 2 weeks, month and year. */
export const REPEAT_PRESETS: readonly (SimpleRepeat | null)[] = [
  null,
  { every: 1, unit: 'days', days: [] },
  { every: 1, unit: 'weeks', days: [] },
  { every: 2, unit: 'weeks', days: [] },
  { every: 1, unit: 'months', days: [] },
  { every: 1, unit: 'years', days: [] },
];

/** True when two rules repeat the same way (same RRULE once normalized). */
export const sameRepeat = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const pa = parseRepeat(a);
  const pb = parseRepeat(b);
  if (pa === 'custom' || pb === 'custom') return (a ?? null) === (b ?? null);
  return (pa ? repeatRule(pa) : null) === (pb ? repeatRule(pb) : null);
};

/** Weekday codes in week order from `weekStart` (0 = Sunday). */
export const weekOrder = (weekStart: number): WeekdayCode[] =>
  WEEKDAY_CODES.map((_, i) => WEEKDAY_CODES[(weekStart + i) % 7] as WeekdayCode);

// 4 January 2026 was a Sunday: a date for each weekday, to name them.
const dayDate = (code: WeekdayCode): Date => new Date(Date.UTC(2026, 0, 4 + WEEKDAY_CODES.indexOf(code)));

/** A weekday's name in `locale`: "M" (narrow), "Mon" (short) or "Monday" (long). */
export const weekdayName = (code: WeekdayCode, locale: string, width: 'narrow' | 'short' | 'long' = 'short'): string =>
  new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(dayDate(code));

/** The weekday code of a UTC wall date (the event's start as a wall time). */
export const weekdayOf = (wall: Date): WeekdayCode => WEEKDAY_CODES[wall.getUTCDay()] as WeekdayCode;

/** The i18next `t` (only keys and count/interpolation options are used). */
type T = (key: string, options: { count?: number; rule?: string; days?: string }) => string;

/** "Every 2 weeks on Mon and Wed", "Every day", "Does not repeat", or "Custom rule". */
export function repeatLabel(rrule: string | null | undefined, t: T, locale: string, weekStart = 1): string {
  const r = parseRepeat(rrule);
  if (r === null) return t('repeat.none', {});
  if (r === 'custom') return t('repeat.custom', {});
  return simpleRepeatLabel(r, t, locale, weekStart);
}

/** The sentence for a SimpleRepeat, as repeatLabel. */
export function simpleRepeatLabel(r: SimpleRepeat, t: T, locale: string, weekStart = 1): string {
  const base = t(`repeat.every_${r.unit}`, { count: r.every });
  if (r.unit !== 'weeks' || !r.days.length) return base;
  const days = weekOrder(weekStart).filter((d) => r.days.includes(d));
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    days.map((d) => weekdayName(d, locale)),
  );
  return t('repeat.onDays', { rule: base, days: list });
}
