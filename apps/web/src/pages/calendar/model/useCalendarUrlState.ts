import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useHomeZone } from '@/hooks/settings';
import { DEFAULT_VIEW, type View } from '@/schemas';
import { isoDate, parseIsoDate, today } from '@/services/dates';

export type CalendarUrlState = {
  view: View;
  /** The date shown, as a wall date in `tz`. */
  date: Date;
  /** The zone the calendar is shown in (always the home zone). */
  tz: string;
  homeTz: string;
  go: (next: { view?: View; date?: Date }) => void;
};

/** The view and date, kept in the URL (?view=week&date=2026-11-19) so reloads and links keep them. Zone comes from settings. */
export function useCalendarUrlState(): CalendarUrlState {
  const search = useSearch({ from: '/_app/' });
  const navigate = useNavigate({ from: '/' });
  const homeTz = useHomeZone();
  const tz = homeTz;
  const view = search.view ?? DEFAULT_VIEW;
  const date = useMemo((): Date => parseIsoDate(search.date, today(tz)), [search.date, tz]);
  return {
    view,
    date,
    tz,
    homeTz,
    go: (next: { view?: View; date?: Date }): void => {
      void navigate({ search: { ...search, view: next.view ?? view, date: isoDate(next.date ?? date) } });
    },
  };
}
