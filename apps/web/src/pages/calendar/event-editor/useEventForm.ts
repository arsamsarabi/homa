// The event form's state and saving. Turning input into an API body is in @/services/event-form.
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSeries } from '@/hooks/calendar';
import { useSettings } from '@/hooks/settings';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { writableCalendarPickerGroups } from '@/services/calendar-sharing';
import {
  buildEditorResult,
  type Draft,
  draftAllDay,
  draftZone,
  formTimes,
  parseFormTimes,
  REPEATS,
  type Repeat,
  shownRepeat,
  travelChoices,
  travelDuration,
} from '@/services/event-form';
import { DEFAULT_REMINDER } from '@/services/reminders';
import { timeZones } from '@/services/zones';

export type EventFormModel = {
  occurrence: Occurrence | undefined;
  /** The title the form starts with. */
  summary: string;
  setSummary: (v: string) => void;
  /** The occurrence is in a read-only calendar: show its details, not a form. */
  readOnly: boolean;
  /** Free/busy shared occurrence: show the small Busy card (no event fetch). */
  freeBusy: boolean;
  calendarOptions: { group: string; items: { value: string; label: string }[] }[];
  repeatOptions: { value: Repeat; label: string }[];
  zones: string[];
  /** The event's zone; timed values in the form are in it. */
  tz: string;
  setTz: (v: string) => void;
  allDay: boolean;
  setAllDay: (v: boolean) => void;
  calendarId: string;
  setCalendarId: (v: string) => void;
  repeat: Repeat;
  setRepeat: (v: Repeat) => void;
  /** The repeat can't be shown until the series has loaded. */
  repeatLoading: boolean;
  times: { start: string; end: string };
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  busy: boolean;
  error: string | undefined;
  submit: (e: FormEvent<HTMLFormElement>) => void;
  remove: () => void;
  close: () => void;
  markDirty: () => void;
  /** The chosen calendar's color, for the header dot. */
  color: string | undefined;
  /** Minutes before each occurrence's start. */
  reminders: number[];
  setReminders: (v: number[]) => void;
  /** An edit's reminders can't be shown until the event has loaded. */
  remindersLoading: boolean;
  /** Minutes of travel before the event, or null for none. */
  travelMinutes: number | null;
  setTravelMinutes: (v: number | null) => void;
  travelOptions: { value: string; label: string }[];
  /** The chosen calendar syncs with another service, which won't get the travel time. */
  synced: boolean;
};

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function useEventForm(draft: Draft): EventFormModel {
  const { t, i18n } = useTranslation();
  const {
    calendars,
    defaultCalendarId,
    isReadOnly,
    accessOf,
    colors,
    actions,
    editor,
    tz: viewTz,
  } = useCalendarPageModel();
  const occurrence = draft.kind === 'edit' ? draft.occurrence : undefined;
  const freeBusy = occurrence !== undefined && accessOf(occurrence.calendarId) === 'freebusy';
  // The event behind the occurrence: its rule, for recurring ones, and its reminders.
  // Free/busy has no event detail (404); skip the fetch.
  const series = useSeries(freeBusy ? undefined : occurrence?.eventId);
  const defaultReminder = useSettings().data?.defaultReminderMinutes;

  const [allDay, setAllDayState] = useState(draftAllDay(draft));
  const [tz, setTzState] = useState(draftZone(draft, viewTz));
  const seed = formTimes(draft, draftAllDay(draft), draftZone(draft, viewTz));
  const [start, setStartState] = useState(seed.start);
  const [end, setEndState] = useState(seed.end);
  const [calendarId, setCalendarId] = useState(
    occurrence?.calendarId ?? (draft.kind === 'create' ? draft.calendarId : undefined) ?? defaultCalendarId ?? '',
  );
  const [picked, setPicked] = useState<Repeat>();
  const [pickedReminders, setReminders] = useState<number[]>();
  const [travelMinutes, setTravelMinutes] = useState<number | null>(occurrence?.travelMinutes ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const seriesRrule = occurrence?.recurring ? series.data?.rrule : undefined;
  // New timed events start with the default reminder (10 minutes unless the user chose another, or none).
  const startReminders = (): number[] => {
    if (occurrence) return series.data?.reminders ?? [];
    const d = defaultReminder === undefined ? DEFAULT_REMINDER : defaultReminder;
    return allDay || d === null ? [] : [d];
  };
  const reminders = pickedReminders ?? startReminders();
  const repeat = shownRepeat(draft, picked, seriesRrule);
  const zones = useMemo((): string[] => timeZones(), []);
  const calendarOptions = useMemo(
    () =>
      writableCalendarPickerGroups(calendars, t('calendars.mine'), (name: string) => t('calendars.sharedBy', { name })),
    [calendars, t],
  );
  const locale = i18n.language;
  const travelOptions = useMemo(
    () => [
      { value: 'none', label: t('editor.travelNone') },
      ...travelChoices(occurrence?.travelMinutes ?? null).map((m) => ({
        value: String(m),
        label: travelDuration(m, locale),
      })),
    ],
    [occurrence?.travelMinutes, locale, t],
  );
  const repeatOptions = useMemo(
    () =>
      REPEATS.filter((r) => r !== 'custom' || repeat === 'custom').map((r) => ({ value: r, label: t(`repeat.${r}`) })),
    [repeat, t],
  );

  function syncPreview(nextAllDay: boolean, nextTz: string, nextStart: string, nextEnd: string): void {
    const span = parseFormTimes(nextAllDay, nextStart, nextEnd, nextTz);
    if (span) editor.setTimes(span.start, span.end, nextAllDay);
  }

  function setAllDay(v: boolean): void {
    // Changing all-day resets the inputs from the draft (same as remounting with a new key before).
    const next = formTimes(draft, v, tz);
    setAllDayState(v);
    setStartState(next.start);
    setEndState(next.end);
    editor.markDirty();
    syncPreview(v, tz, next.start, next.end);
  }

  function setTz(v: string): void {
    // Zone change keeps the typed wall times and moves the instant (and the draft) with them.
    setTzState(v);
    editor.markDirty();
    syncPreview(allDay, v, start, end);
  }

  function setStart(v: string): void {
    setStartState(v);
    editor.markDirty();
    syncPreview(allDay, tz, v, end);
  }

  function setEnd(v: string): void {
    setEndState(v);
    editor.markDirty();
    syncPreview(allDay, tz, start, v);
  }

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string): string => String(f.get(k) ?? '');
    const result = buildEditorResult(
      draft,
      {
        summary: get('summary'),
        description: get('description'),
        location: get('location'),
        start,
        end,
        allDay,
        tz,
        calendarId,
        repeat: picked,
        reminders: occurrence ? pickedReminders : reminders,
        travelMinutes,
      },
      { seriesRrule },
    );
    if (result === 'endBeforeStart') {
      setError(t('editor.endBeforeStart'));
      return;
    }
    void run(() => actions.save(result));
  }

  return {
    occurrence,
    summary: draft.summary ?? occurrence?.summary ?? '',
    setSummary: (v: string): void => {
      editor.setSummary(v);
    },
    readOnly: occurrence !== undefined && isReadOnly(occurrence.calendarId),
    freeBusy,
    calendarOptions,
    repeatOptions,
    zones,
    tz,
    setTz,
    allDay,
    setAllDay,
    calendarId,
    setCalendarId: (v: string): void => {
      editor.markDirty();
      setCalendarId(v);
    },
    color: colors[calendarId],
    repeat,
    setRepeat: (v: Repeat): void => {
      editor.markDirty();
      setPicked(v);
    },
    repeatLoading: Boolean(occurrence?.recurring) && series.isPending,
    times: { start, end },
    setStart,
    setEnd,
    busy,
    error,
    submit,
    remove: (): void => {
      // Do not wrap in run(): remove closes the editor before the request finishes.
      if (occurrence) void actions.remove(occurrence);
    },
    close: editor.requestClose,
    markDirty: editor.markDirty,
    reminders,
    setReminders: (v: number[]): void => {
      editor.markDirty();
      setReminders(v);
    },
    remindersLoading: occurrence !== undefined && series.isPending,
    travelMinutes,
    travelOptions,
    synced: Boolean(calendars.find((c) => c.id === calendarId)?.connectionId),
    setTravelMinutes: (v: number | null): void => {
      editor.markDirty();
      setTravelMinutes(v);
    },
  };
}
