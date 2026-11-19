// The calendar page's composition root: wires the focused hooks into one model for the page's
// children (read through useCalendarPageModel, not props).
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCalendars, useOccurrences } from '@/hooks/calendar';
import { type DateFormats, useCalendarLocale, useDateFormats } from '@/hooks/locale';
import { useSettings } from '@/hooks/settings';
import type { Calendar, Occurrence, SecondaryCalendar, View } from '@/schemas';
import { type DayRange, rangeFor, today } from '@/services/dates';
import { instantOf } from '@/services/zones';
import { type CalendarUrlState, useCalendarUrlState } from './useCalendarUrlState';
import { type EventEditorState, useEventEditor } from './useEventEditor';
import { type OccurrenceActions, useOccurrenceActions } from './useOccurrenceActions';
import { type ScopePrompt, useScopePrompt } from './useScopePrompt';

export type CalendarPageModel = CalendarUrlState & {
  range: DayRange;
  locale: string;
  weekStart: number;
  formats: DateFormats;
  secondary: SecondaryCalendar;
  /** Today, as a wall date in the viewed zone. */
  today: Date;
  calendars: Calendar[];
  /** Calendar id → color. */
  colors: Record<string, string>;
  occurrences: UseQueryResult<Occurrence[]>;
  pickDay: (d: Date) => void;
  editor: EventEditorState;
  scope: ScopePrompt;
  actions: OccurrenceActions;
};

export function useCalendarPage(): CalendarPageModel {
  const url = useCalendarUrlState();
  const calendarLocale = useCalendarLocale();
  const { locale, weekStart } = calendarLocale;
  const formats = useDateFormats(calendarLocale);
  const secondary = useSettings().data?.secondaryCalendar ?? 'none';
  const range = useMemo((): DayRange => rangeFor(url.view, url.date, weekStart), [url.view, url.date, weekStart]);
  const calendarsQuery = useCalendars();
  // The range's wall dates, as instants in the viewed zone.
  const occurrences = useOccurrences(instantOf(range.from, url.tz), instantOf(range.to, url.tz));
  const editor = useEventEditor();
  const scope = useScopePrompt();
  const actions = useOccurrenceActions(scope.ask, editor.close);

  const calendars = useMemo((): Calendar[] => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const colors = useMemo(
    (): Record<string, string> => Object.fromEntries(calendars.map((c) => [c.id, c.color])),
    [calendars],
  );
  const pickDay = (d: Date): void => url.go({ view: 'day' satisfies View, date: d });

  return {
    ...url,
    range,
    locale,
    weekStart,
    formats,
    secondary,
    today: today(url.tz),
    calendars,
    colors,
    occurrences,
    pickDay,
    editor,
    scope,
    actions,
  };
}
