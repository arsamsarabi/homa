import { useMemo } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { busyDates } from '@/services/calendar-layout';
import { monthGrid } from '@/services/dates';

export type YearMonth = { ref: Date; days: Date[] };
export type YearViewModel = { months: YearMonth[]; busy: Set<string>; pickDay: (d: Date) => void };

export function useYearView(): YearViewModel {
  const { date, weekStart, occurrences, pickDay } = useCalendarPageModel();
  const year = date.getFullYear();
  const occ = occurrences.data;
  const months = useMemo(
    (): YearMonth[] =>
      Array.from({ length: 12 }, (_, m) => {
        const ref = new Date(year, m, 1);
        return { ref, days: monthGrid(ref, weekStart) };
      }),
    [year, weekStart],
  );
  const busy = useMemo((): Set<string> => busyDates(occ ?? []), [occ]);
  return { months, busy, pickDay };
}
