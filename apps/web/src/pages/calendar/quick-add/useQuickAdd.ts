// Quick add's state: the line typed, its live preview, and creating the event (Enter) or opening
// the full editor prefilled (Shift+Enter, Alt+Enter or "More options").
import { useDebouncedValue } from '@mantine/hooks';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomeZone } from '@/hooks/settings';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { startOfDay } from '@/services/dates';
import {
  parseQuickAdd,
  previewOf,
  type QuickAdd,
  type QuickAddFormats,
  type QuickAddPreview,
  quickAddBody,
} from '@/services/quick-add';
import { repeatLabel } from '@/services/repeat';
import { wallOf } from '@/services/zones';
import { useAnnouncer } from '@/stores';

/** The input's id, so the "Q" shortcut can focus it. */
export const QUICK_ADD_INPUT_ID = 'quick-add';

export type QuickAddModel = {
  text: string;
  setText: (v: string) => void;
  /** Undefined while the input is empty. */
  preview:
    | (QuickAddPreview & {
        title: string;
        jalali: string | undefined;
        /** "Every week", "Every week on Mon, Wed"; undefined if it doesn't repeat. */
        repeatText: string | undefined;
      })
    | undefined;
  calendarName: string | undefined;
  calendarColor: string | undefined;
  /** No writable calendar: Enter opens the editor instead. */
  noCalendar: boolean;
  busy: boolean;
  error: string | undefined;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Opens the full editor with what was typed. */
  more: () => void;
};

export function useQuickAdd(): QuickAddModel {
  const { t } = useTranslation();
  const {
    weekStart,
    locale,
    formats,
    secondary,
    writableCalendars,
    defaultCalendarId,
    colors,
    actions,
    editor,
    go,
    tz,
  } = useCalendarPageModel();
  const homeTz = useHomeZone();
  const announce = useAnnouncer((s) => s.announce);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const read = (): QuickAdd => parseQuickAdd(text, { now: new Date(), tz: homeTz, weekStart });
  const parsed = useMemo(
    (): QuickAdd | undefined =>
      text.trim() ? parseQuickAdd(text, { now: new Date(), tz: homeTz, weekStart }) : undefined,
    [text, homeTz, weekStart],
  );

  const previewFormats = useMemo(
    (): QuickAddFormats => ({
      date: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
      time: formats.time,
      locale,
    }),
    [locale, formats],
  );
  const preview = useMemo((): QuickAddModel['preview'] => {
    if (!parsed) return undefined;
    const p = previewOf(parsed, homeTz, previewFormats);
    const day = parsed.allDay ? parsed.start : wallOf(parsed.start, homeTz);
    const repeatText = p.rrule ? repeatLabel(p.rrule, t, locale, weekStart) : undefined;
    return {
      ...p,
      title: parsed.title,
      jalali: secondary === 'jalali' ? formats.jalaliDayMonth.format(day) : undefined,
      repeatText,
    };
  }, [parsed, homeTz, previewFormats, secondary, formats, t, locale, weekStart]);

  const calendar = writableCalendars.find((c) => c.id === defaultCalendarId);
  const summary = preview
    ? [
        preview.title || t('calendar.untitled'),
        preview.when,
        preview.length,
        preview.repeatText,
        calendar?.name,
        preview.defaulted ? t('quickAdd.noDate') : undefined,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  // Read the preview out once typing pauses, not on every key.
  const [spoken] = useDebouncedValue(summary, 700);
  useEffect(() => {
    if (spoken) announce(t('quickAdd.announce', { preview: spoken }), { toast: false });
  }, [spoken, announce, t]);

  function openEditor(q: QuickAdd): void {
    editor.openCreate(q.start, q.end, q.allDay, { summary: q.title, rrule: q.rrule, calendarId: defaultCalendarId });
    setText('');
  }

  function create(): void {
    if (!text.trim() || busy) return;
    const q = read();
    if (!defaultCalendarId) {
      openEditor(q);
      return;
    }
    setBusy(true);
    setError(undefined);
    actions
      .save({ kind: 'create', body: quickAddBody(q, defaultCalendarId, homeTz) })
      .then(() => {
        setText('');
        // Show the day the event landed on.
        go({ date: q.allDay ? q.start : startOfDay(wallOf(q.start, tz)) });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }

  return {
    text,
    setText: (v: string): void => {
      setText(v);
      setError(undefined);
    },
    preview,
    calendarName: calendar?.name,
    calendarColor: calendar ? colors[calendar.id] : undefined,
    noCalendar: !defaultCalendarId,
    busy,
    error,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.nativeEvent.isComposing) return; // an input method (Farsi, say) is still composing
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey || e.altKey) {
          if (text.trim()) openEditor(read());
        } else create();
      } else if (e.key === 'Escape' && text) {
        e.preventDefault();
        setText('');
      }
    },
    more: (): void => openEditor(read()),
  };
}
