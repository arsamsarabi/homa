// Calendar formatting per UI language.
// shortcut: Gregorian only; the Solar Hijri calendar and a home time zone come in phase 2c.

export type CalendarLocale = { locale: string; weekStart: number };

/** The Intl locale and first day of the week (0 = Sunday) for a UI language. */
export const calendarLocale = (language: string): CalendarLocale =>
  language === 'fa' ? { locale: 'fa-IR-u-ca-gregory', weekStart: 6 } : { locale: 'en-GB', weekStart: 1 };

/** The browser's IANA time zone, for new timed events. */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
