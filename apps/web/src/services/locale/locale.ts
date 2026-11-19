// Calendar formatting per UI language.

/** `locale` formats Gregorian dates, `jalaliLocale` Solar Hijri ones; weeks start on `weekStart` (0 = Sunday). */
export type CalendarLocale = { locale: string; jalaliLocale: string; weekStart: number };

/** The Intl locales and first day of the week for a UI language. */
export const calendarLocale = (language: string): CalendarLocale =>
  language === 'fa'
    ? { locale: 'fa-IR-u-ca-gregory', jalaliLocale: 'fa-IR-u-ca-persian', weekStart: 6 }
    : { locale: 'en-GB', jalaliLocale: 'en-GB-u-ca-persian', weekStart: 1 };
