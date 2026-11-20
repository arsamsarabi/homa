// The Jalali (Solar Hijri) calendar, from Intl's "persian" calendar. Days are wall dates (UTC midnights).

const DAY = 86_400_000;

export type JalaliDate = { year: number; month: number; day: number };

const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

/** The Jalali year, month (1 = Farvardin) and day of a date. */
export function jalaliDate(day: Date): JalaliDate {
  const p: Record<string, number> = {};
  for (const { type, value } of parts.formatToParts(day)) p[type] = Number.parseInt(value, 10);
  return { year: p.year ?? 0, month: p.month ?? 0, day: p.day ?? 0 };
}

/** The Gregorian wall date of a Jalali date, or undefined if there is no such day (31 Mehr, say). */
export function fromJalali(year: number, month: number, day: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // 1 Farvardin falls on 20 or 21 March (Gregorian year = Jalali + 621): guess, then check nearby days.
  const offset = (month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day - 1;
  const guess = Date.UTC(year + 621, 2, 20) + offset * DAY;
  for (const delta of [0, 1, -1, 2, -2]) {
    const d = new Date(guess + delta * DAY);
    const j = jalaliDate(d);
    if (j.year === year && j.month === month && j.day === day) return d;
  }
  return undefined;
}
