import { useMemo } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { busyDates } from '@/services/calendar-layout';
import { monthGrid } from '@/services/dates';

export type YearMonth = { ref: Date; days: Date[] };
export type YearViewModel = { months: YearMonth[]; busy: Set<string>; pickDay: (d: Date) => void };

export function useYearView(): YearViewModel {
  const { date, tz, weekStart, occurrences, pickDay } = useCalendarPageModel();
  const year = date.getUTCFullYear();
  const occ = occurrences.data;
  const months = useMemo(
    (): YearMonth[] =>
      Array.from({ length: 12 }, (_, m) => {
        const ref = new Date(Date.UTC(year, m, 1));
        return { ref, days: monthGrid(ref, weekStart) };
      }),
    [year, weekStart],
  );
  const busy = useMemo((): Set<string> => busyDates(occ ?? [], tz), [occ, tz]);
  return { months, busy, pickDay };
}
