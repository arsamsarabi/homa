import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DEFAULT_VIEW, type View } from '@/schemas';
import { isoDate, parseIsoDate } from '@/services/dates';

export type CalendarUrlState = { view: View; date: Date; go: (next: { view?: View; date?: Date }) => void };

/** The view and date, kept in the URL (?view=week&date=2026-11-19) so reloads and links keep them. */
export function useCalendarUrlState(): CalendarUrlState {
  const search = useSearch({ from: '/_app/' });
  const navigate = useNavigate({ from: '/' });
  const view = search.view ?? DEFAULT_VIEW;
  const date = useMemo((): Date => parseIsoDate(search.date), [search.date]);
  const go = (next: { view?: View; date?: Date }): void => {
    void navigate({ search: { view: next.view ?? view, date: isoDate(next.date ?? date) } });
  };
  return { view, date, go };
}
