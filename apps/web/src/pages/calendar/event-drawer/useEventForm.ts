// The event form's state and saving. Turning input into an API body is in @/services/event-form.
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSeries } from '@/hooks/calendar';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import {
  buildEditorResult,
  type Draft,
  draftAllDay,
  draftZone,
  formTimes,
  REPEATS,
  type Repeat,
  shownRepeat,
} from '@/services/event-form';
import { timeZones } from '@/services/zones';

export type EventFormModel = {
  occurrence: Occurrence | undefined;
  calendarOptions: { value: string; label: string }[];
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
  busy: boolean;
  error: string | undefined;
  submit: (e: FormEvent<HTMLFormElement>) => void;
  remove: () => void;
  close: () => void;
};

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function useEventForm(draft: Draft): EventFormModel {
  const { t } = useTranslation();
  const { calendars, actions, drawer, tz: viewTz } = useCalendarPageModel();
  const occurrence = draft.kind === 'edit' ? draft.occurrence : undefined;
  const series = useSeries(occurrence?.recurring ? occurrence.eventId : undefined);

  const [allDay, setAllDay] = useState(draftAllDay(draft));
  const [tz, setTz] = useState(draftZone(draft, viewTz));
  const [calendarId, setCalendarId] = useState(occurrence?.calendarId ?? calendars[0]?.id ?? '');
  const [picked, setPicked] = useState<Repeat>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const seriesRrule = series.data?.rrule;
  const repeat = shownRepeat(draft, picked, seriesRrule);
  // Recomputed when the zone changes, but the inputs keep what was typed: changing the zone keeps the
  // wall times and moves the event, as other calendars do.
  const times = useMemo(() => formTimes(draft, allDay, tz), [draft, allDay, tz]);
  const zones = useMemo((): string[] => timeZones(), []);
  const calendarOptions = useMemo(() => calendars.map((c) => ({ value: c.id, label: c.name })), [calendars]);
  const repeatOptions = useMemo(
    () =>
      REPEATS.filter((r) => r !== 'custom' || repeat === 'custom').map((r) => ({ value: r, label: t(`repeat.${r}`) })),
    [repeat, t],
  );

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
        start: get('start'),
        end: get('end'),
        allDay,
        tz,
        calendarId,
        repeat: picked,
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
    calendarOptions,
    repeatOptions,
    zones,
    tz,
    setTz,
    allDay,
    setAllDay,
    calendarId,
    setCalendarId,
    repeat,
    setRepeat: setPicked,
    repeatLoading: Boolean(occurrence?.recurring) && series.isPending,
    times,
    busy,
    error,
    submit,
    remove: (): void => {
      if (occurrence) void run(() => actions.remove(occurrence));
    },
    close: drawer.close,
  };
}
