import { useMemo } from 'react';
import type { CalendarLocale } from '@/services/locale';

export type DateFormats = {
  time: Intl.DateTimeFormat;
  weekdayShort: Intl.DateTimeFormat;
  weekdayNarrow: Intl.DateTimeFormat;
  weekdayLong: Intl.DateTimeFormat;
  dayHeader: Intl.DateTimeFormat;
  dayNumber: Intl.DateTimeFormat;
  monthName: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
  year: Intl.DateTimeFormat;
  fullDate: Intl.DateTimeFormat;
  dayMonth: Intl.DateTimeFormat;
  shortDayMonth: Intl.DateTimeFormat;
  /** Solar Hijri: "28 Aban", "Aban 1405" and "28 Aban 1405". */
  jalaliDayMonth: Intl.DateTimeFormat;
  jalaliMonthYear: Intl.DateTimeFormat;
  jalaliFullDate: Intl.DateTimeFormat;
};

/**
 * Date formatters for a calendar locale, built once per locale. They format wall times (see
 * @/services/zones), so they all read the date in UTC.
 */
export function useDateFormats({ locale, jalaliLocale }: CalendarLocale): DateFormats {
  return useMemo((): DateFormats => {
    const f = (o: Intl.DateTimeFormatOptions, l = locale): Intl.DateTimeFormat =>
      new Intl.DateTimeFormat(l, { ...o, timeZone: 'UTC' });
    return {
      time: f({ hour: 'numeric', minute: '2-digit' }),
      weekdayShort: f({ weekday: 'short' }),
      weekdayNarrow: f({ weekday: 'narrow' }),
      weekdayLong: f({ weekday: 'long', day: 'numeric', month: 'long' }),
      dayHeader: f({ weekday: 'short', day: 'numeric' }),
      dayNumber: f({ day: 'numeric' }),
      monthName: f({ month: 'long' }),
      monthYear: f({ month: 'long', year: 'numeric' }),
      year: f({ year: 'numeric' }),
      fullDate: f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      dayMonth: f({ day: 'numeric', month: 'long' }),
      shortDayMonth: f({ day: 'numeric', month: 'short' }),
      jalaliDayMonth: f({ day: 'numeric', month: 'short' }, jalaliLocale),
      jalaliMonthYear: f({ month: 'long', year: 'numeric' }, jalaliLocale),
      jalaliFullDate: f({ day: 'numeric', month: 'long', year: 'numeric' }, jalaliLocale),
    };
  }, [locale, jalaliLocale]);
}
