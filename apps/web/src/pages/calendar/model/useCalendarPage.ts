// The calendar page's composition root: wires the focused hooks into one model for the page's
// children (read through useCalendarPageModel, not props).
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCalendars, useOccurrences } from '@/hooks/calendar';
import { type DateFormats, useCalendarLocale, useDateFormats } from '@/hooks/locale';
import { useSettings } from '@/hooks/settings';
import { type Calendar, DEFAULT_WORK_WEEK_DAYS, type Occurrence, type SecondaryCalendar, type View } from '@/schemas';
import { type DayRange, rangeFor, today } from '@/services/dates';
import { instantOf } from '@/services/zones';
import { defaultCalendarId, useLastCalendar } from '@/stores';
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
  /** Calendars events can be created in or moved to (not subscriptions). */
  writableCalendars: Calendar[];
  /** Where new events go: the last calendar created in, else the first writable one. */
  defaultCalendarId: string | undefined;
  /** True for a read-only calendar (a subscription): its events open as details, not a form. */
  isReadOnly: (calendarId: string) => boolean;
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
  const settings = useSettings().data;
  const secondary = settings?.secondaryCalendar ?? 'none';
  const workWeekDays = settings?.workWeekDays ?? DEFAULT_WORK_WEEK_DAYS;
  const range = useMemo(
    (): DayRange => rangeFor(url.view, url.date, weekStart, workWeekDays),
    [url.view, url.date, weekStart, workWeekDays],
  );
  const calendarsQuery = useCalendars();
  const hiddenIds = useMemo(
    (): ReadonlySet<string> => new Set((calendarsQuery.data ?? []).filter((c) => c.hidden).map((c) => c.id)),
    [calendarsQuery.data],
  );
  // The range's wall dates, as instants in the viewed zone; hidden calendars are left out.
  const occurrences = useOccurrences(instantOf(range.from, url.tz), instantOf(range.to, url.tz), hiddenIds);
  const editor = useEventEditor();
  const scope = useScopePrompt();
  const actions = useOccurrenceActions(scope.ask, editor.close);

  const calendars = useMemo((): Calendar[] => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const colors = useMemo(
    (): Record<string, string> => Object.fromEntries(calendars.map((c) => [c.id, c.color])),
    [calendars],
  );
  const writableCalendars = useMemo((): Calendar[] => calendars.filter((c) => !c.readOnly), [calendars]);
  const readOnlyIds = useMemo(
    (): ReadonlySet<string> => new Set(calendars.filter((c) => c.readOnly).map((c) => c.id)),
    [calendars],
  );
  const lastCalendarId = useLastCalendar((s) => s.id);
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
    writableCalendars,
    defaultCalendarId: defaultCalendarId(
      writableCalendars.map((c) => c.id),
      lastCalendarId,
    ),
    isReadOnly: (calendarId: string): boolean => readOnlyIds.has(calendarId),
    colors,
    occurrences,
    pickDay,
    editor,
    scope,
    actions,
  };
}
