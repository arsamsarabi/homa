// Quick add in the web app: turning a parsed line (@homa/core/quick-add) into an API create body,
// and the pieces its preview shows. Parsing itself is in @homa/core so a mobile app can share it.
import type { QuickAdd } from '@homa/core/quick-add';
import type { EventInput } from '@/api';
import { addDays, sameDay } from '@/services/dates';
import { wallOf } from '@/services/zones';

export { parseQuickAdd, type QuickAdd, type QuickAddContext } from '@homa/core/quick-add';

/** The create body for a parsed line, in `calendarId`. Timed events keep the zone they were read in. */
export const quickAddBody = (q: QuickAdd, calendarId: string, tz: string): EventInput => ({
  summary: q.title,
  description: null,
  location: null,
  start: q.start.toISOString(),
  end: q.end.toISOString(),
  calendarId,
  allDay: q.allDay,
  tz: q.allDay ? 'UTC' : tz,
  rrule: q.rrule,
});

export type QuickAddFormats = {
  /** A date, like "Tuesday 24 November". */
  date: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  locale: string;
};

/** What the preview shows, before translation. */
export type QuickAddPreview = {
  /** The date or dates, with times for a timed event. */
  when: string;
  /** "45 min", "3 hr"; undefined for all-day events. */
  length: string | undefined;
  /** The parsed RRULE, or null when the line doesn't repeat. */
  rrule: string | null;
  defaulted: boolean;
};

/** The preview of a parsed line, with times shown in `tz` (the zone it was read in). */
export function previewOf(q: QuickAdd, tz: string, f: QuickAddFormats): QuickAddPreview {
  let when: string;
  let length: string | undefined;
  if (q.allDay) {
    const last = addDays(q.end, -1);
    when = sameDay(q.start, last) ? f.date.format(q.start) : f.date.formatRange(q.start, last);
  } else {
    const s = wallOf(q.start, tz);
    const e = wallOf(q.end, tz);
    when = sameDay(s, e)
      ? `${f.date.format(s)}, ${f.time.formatRange(s, e)}`
      : `${f.date.format(s)}, ${f.time.format(s)} – ${f.date.format(e)}, ${f.time.format(e)}`;
    length = lengthOf(Math.round((q.end.getTime() - q.start.getTime()) / 60_000), f.locale);
  }
  return {
    when,
    length,
    rrule: q.rrule ?? null,
    defaulted: q.defaulted,
  };
}

/** "45 min", "2 hr", "1.5 hr", in the UI language. */
function lengthOf(minutes: number, locale: string): string {
  const unit = minutes < 60 ? 'minute' : 'hour';
  const value = minutes < 60 ? minutes : Math.round((minutes / 60) * 100) / 100;
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
}
