// The calendar page's composition root: wires the focused hooks into one model for the page's
// children (read through useCalendarPageModel, not props).
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCalendars, useOccurrences } from '@/hooks/calendar';
import { type DateFormats, useCalendarLocale, useDateFormats } from '@/hooks/locale';
import type { Calendar, Occurrence, View } from '@/schemas';
import { type DayRange, rangeFor } from '@/services/dates';
import { type CalendarUrlState, useCalendarUrlState } from './useCalendarUrlState';
import { type EventDrawerState, useEventDrawer } from './useEventDrawer';
import { type OccurrenceActions, useOccurrenceActions } from './useOccurrenceActions';
import { type ScopePrompt, useScopePrompt } from './useScopePrompt';

export type CalendarPageModel = CalendarUrlState & {
  range: DayRange;
  locale: string;
  weekStart: number;
  formats: DateFormats;
  calendars: Calendar[];
  /** Calendar id → color. */
  colors: Record<string, string>;
  occurrences: UseQueryResult<Occurrence[]>;
  pickDay: (d: Date) => void;
  drawer: EventDrawerState;
  scope: ScopePrompt;
  actions: OccurrenceActions;
};

export function useCalendarPage(): CalendarPageModel {
  const url = useCalendarUrlState();
  const { locale, weekStart } = useCalendarLocale();
  const formats = useDateFormats(locale);
  const range = useMemo((): DayRange => rangeFor(url.view, url.date, weekStart), [url.view, url.date, weekStart]);
  const calendarsQuery = useCalendars();
  const occurrences = useOccurrences(range.from, range.to);
  const drawer = useEventDrawer();
  const scope = useScopePrompt();
  const actions = useOccurrenceActions(scope.ask, drawer.close);

  const calendars = useMemo((): Calendar[] => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const colors = useMemo(
    (): Record<string, string> => Object.fromEntries(calendars.map((c) => [c.id, c.color])),
    [calendars],
  );
  const pickDay = (d: Date): void => url.go({ view: 'day' satisfies View, date: d });

  return { ...url, range, locale, weekStart, formats, calendars, colors, occurrences, pickDay, drawer, scope, actions };
}
