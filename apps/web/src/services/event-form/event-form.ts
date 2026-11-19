// The event drawer's form: starting values for a draft, and turning what was entered into an API
// create body or patch. All-day end dates are inclusive in the form and exclusive in the API.
import type { EventInput, EventPatch } from '@/api';
import type { Occurrence } from '@/schemas';
import { addDays, isoDate, isoLocal, localSpan, parseIsoDate, type Span, utcMidnight } from '@/services/dates';

export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export type Repeat = (typeof REPEATS)[number];

/** What the drawer is open for. */
export type Draft =
  | { kind: 'create'; start: Date; end: Date; allDay: boolean }
  | { kind: 'edit'; occurrence: Occurrence };

export type EditorResult =
  | { kind: 'create'; body: EventInput }
  | { kind: 'edit'; occurrence: Occurrence; patch: EventPatch; seriesChanged: boolean };

export type FormInput = {
  summary: string;
  description: string;
  location: string;
  /** Date (all-day) or datetime-local strings. */
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  /** The repeat picked in the form, or undefined if untouched. */
  repeat: Repeat | undefined;
};

/** The simple repeat choice an RRULE matches, or 'custom' for anything else. */
export function repeatOf(rrule: string | null | undefined): Repeat {
  if (!rrule) return 'none';
  const m = rrule.match(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)$/);
  return m?.[1] ? (m[1].toLowerCase() as Repeat) : 'custom';
}

/** The RRULE for a repeat choice; 'custom' keeps the series' current rule. */
export const rruleOf = (repeat: Repeat, current: string | null): string | null =>
  repeat === 'none' ? null : repeat === 'custom' ? current : `FREQ=${repeat.toUpperCase()}`;

const draftSpan = (draft: Draft): Span => (draft.kind === 'edit' ? localSpan(draft.occurrence) : draft);
export const draftAllDay = (draft: Draft): boolean => (draft.kind === 'edit' ? draft.occurrence.allDay : draft.allDay);

/** The start and end input values for a draft, shown as all-day (dates) or timed. */
export function formTimes(draft: Draft, allDay: boolean): { start: string; end: string } {
  const span = draftSpan(draft);
  const wasAllDay = draftAllDay(draft);
  if (allDay) return { start: isoDate(span.start), end: isoDate(wasAllDay ? addDays(span.end, -1) : span.end) };
  return {
    start: isoLocal(span.start),
    end: isoLocal(wasAllDay ? new Date(span.start.getTime() + 3_600_000) : span.end),
  };
}

/** The repeat shown in the form: what was picked, else the series' rule, else none. */
export const shownRepeat = (draft: Draft, picked: Repeat | undefined, seriesRrule: string | null | undefined): Repeat =>
  picked ?? (draft.kind === 'edit' && draft.occurrence.recurring ? repeatOf(seriesRrule) : 'none');

/** The times entered, as instants; undefined if the end isn't after the start. */
export function parseFormTimes(allDay: boolean, start: string, end: string): Span | undefined {
  const span = allDay
    ? { start: utcMidnight(parseIsoDate(start)), end: utcMidnight(addDays(parseIsoDate(end), 1)) }
    : { start: new Date(start), end: new Date(end) };
  return span.end > span.start ? span : undefined;
}

/**
 * What saving the form does. `seriesChanged` marks changes (calendar, all-day, repeat) that can't
 * apply to one occurrence alone. Returns 'endBeforeStart' when the times are backwards.
 */
export function buildEditorResult(
  draft: Draft,
  input: FormInput,
  ctx: { seriesRrule: string | null | undefined; tz: string },
): EditorResult | 'endBeforeStart' {
  const span = parseFormTimes(input.allDay, input.start, input.end);
  if (!span) return 'endBeforeStart';
  const common = {
    summary: input.summary,
    description: input.description || null,
    location: input.location || null,
    start: span.start.toISOString(),
    end: span.end.toISOString(),
  };
  const tz = input.allDay ? 'UTC' : ctx.tz;
  if (draft.kind === 'create') {
    const rrule = rruleOf(shownRepeat(draft, input.repeat, null), null);
    return { kind: 'create', body: { ...common, calendarId: input.calendarId, allDay: input.allDay, tz, rrule } };
  }
  const o = draft.occurrence;
  const patch: EventPatch = { ...common };
  let seriesChanged = false;
  if (input.calendarId !== o.calendarId) {
    patch.calendarId = input.calendarId;
    seriesChanged = true;
  }
  if (input.allDay !== o.allDay) {
    patch.allDay = input.allDay;
    patch.tz = tz;
    seriesChanged = true;
  }
  if (input.repeat !== undefined && input.repeat !== repeatOf(ctx.seriesRrule)) {
    patch.rrule = rruleOf(input.repeat, ctx.seriesRrule ?? null);
    seriesChanged = true;
  }
  return { kind: 'edit', occurrence: o, patch, seriesChanged };
}

/** The slot "New event" starts with: the next whole hour on `date`, an hour long. */
export function newEventSlot(date: Date, now: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(now.getHours() + 1, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 3_600_000) };
}
