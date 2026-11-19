import { useMemo } from 'react';

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
};

/** Date formatters for `locale`, built once per locale. */
export function useDateFormats(locale: string): DateFormats {
  return useMemo((): DateFormats => {
    const f = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => new Intl.DateTimeFormat(locale, o);
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
    };
  }, [locale]);
}
