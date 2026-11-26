// The event drawer's form: starting values for a draft, and turning what was entered into an API
// create body or patch. All-day end dates are inclusive in the form and exclusive in the API.
// Timed values in the form are wall times in the event's zone (the form's zone field).
import type { EventInput, EventPatch } from '@/api';
import type { Occurrence } from '@/schemas';
import { addDays, isoDate, isoLocal, parseIsoDate, parseIsoLocal, type Span, wallSpan } from '@/services/dates';
import { instantOf, wallOf } from '@/services/zones';

export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export type Repeat = (typeof REPEATS)[number];

/** What the drawer is open for. Create times are instants; quick add can prefill a title and RRULE. */
export type Draft =
  | {
      kind: 'create';
      start: Date;
      end: Date;
      allDay: boolean;
      summary?: string;
      rrule?: string | null;
      calendarId?: string;
    }
  | {
      kind: 'edit';
      occurrence: Occurrence;
      /** Live start/end while the form is open (instants, or UTC midnights when all-day). */
      preview?: { start: Date; end: Date; allDay: boolean };
    };

export type EditorResult =
  | { kind: 'create'; body: EventInput }
  | {
      kind: 'edit';
      occurrence: Occurrence;
      patch: EventPatch;
      seriesChanged: boolean;
      /** The series' new reminders, when they were changed. */
      reminders?: number[];
    };

export type FormInput = {
  summary: string;
  description: string;
  location: string;
  /** Date (all-day) or datetime-local strings. */
  start: string;
  end: string;
  allDay: boolean;
  /** The event's zone, for timed events. */
  tz: string;
  calendarId: string;
  /** The repeat picked in the form, or undefined if untouched. */
  repeat: Repeat | undefined;
  /** Reminders (minutes before): what a new event gets, or an edit's change; undefined if untouched. */
  reminders?: number[];
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

/** The draft's times as wall times in `tz` (all-day dates stay as they are). */
function draftSpan(draft: Draft, tz: string): Span {
  if (draft.kind === 'edit') return wallSpan(draft.occurrence, tz);
  return draft.allDay ? draft : { start: wallOf(draft.start, tz), end: wallOf(draft.end, tz) };
}
export const draftAllDay = (draft: Draft): boolean => (draft.kind === 'edit' ? draft.occurrence.allDay : draft.allDay);

/** The zone the form starts with: a timed event's own zone, else the zone being viewed. */
export const draftZone = (draft: Draft, viewTz: string): string =>
  draft.kind === 'edit' && !draft.occurrence.allDay ? draft.occurrence.tz : viewTz;

/** The start and end input values for a draft in zone `tz`, shown as all-day (dates) or timed. */
export function formTimes(draft: Draft, allDay: boolean, tz: string): { start: string; end: string } {
  const span = draftSpan(draft, tz);
  const wasAllDay = draftAllDay(draft);
  if (allDay) return { start: isoDate(span.start), end: isoDate(wasAllDay ? addDays(span.end, -1) : span.end) };
  return {
    start: isoLocal(span.start),
    end: isoLocal(wasAllDay ? new Date(span.start.getTime() + 3_600_000) : span.end),
  };
}

/** The repeat shown in the form: what was picked, else the series' (or prefilled) rule, else none. */
export const shownRepeat = (draft: Draft, picked: Repeat | undefined, seriesRrule: string | null | undefined): Repeat =>
  picked ??
  (draft.kind === 'create' ? repeatOf(draft.rrule) : draft.occurrence.recurring ? repeatOf(seriesRrule) : 'none');

const INVALID = new Date(Number.NaN);

/** The times entered (timed ones in zone `tz`), as instants; undefined if missing or not in order. */
export function parseFormTimes(allDay: boolean, start: string, end: string, tz: string): Span | undefined {
  let span: Span;
  if (allDay) {
    span = { start: parseIsoDate(start, INVALID), end: addDays(parseIsoDate(end, INVALID), 1) };
  } else {
    const s = parseIsoLocal(start);
    const e = parseIsoLocal(end);
    if (!s || !e) return undefined;
    span = { start: instantOf(s, tz), end: instantOf(e, tz) };
  }
  return span.end > span.start ? span : undefined;
}

/**
 * What saving the form does. `seriesChanged` marks changes (calendar, all-day, repeat) that can't
 * apply to one occurrence alone. Returns 'endBeforeStart' when the times are backwards.
 */
export function buildEditorResult(
  draft: Draft,
  input: FormInput,
  ctx: { seriesRrule: string | null | undefined },
): EditorResult | 'endBeforeStart' {
  const span = parseFormTimes(input.allDay, input.start, input.end, input.tz);
  if (!span) return 'endBeforeStart';
  const common = {
    summary: input.summary,
    description: input.description || null,
    location: input.location || null,
    start: span.start.toISOString(),
    end: span.end.toISOString(),
  };
  const tz = input.allDay ? 'UTC' : input.tz;
  if (draft.kind === 'create') {
    const rrule = rruleOf(shownRepeat(draft, input.repeat, null), draft.rrule ?? null);
    const body = { ...common, calendarId: input.calendarId, allDay: input.allDay, tz, rrule };
    return { kind: 'create', body: input.reminders ? { ...body, reminders: input.reminders } : body };
  }
  const o = draft.occurrence;
  const patch: EventPatch = { ...common };
  let seriesChanged = false;
  if (input.calendarId !== o.calendarId) {
    patch.calendarId = input.calendarId;
    seriesChanged = true;
  }
  if (input.allDay !== o.allDay) patch.allDay = input.allDay;
  if (input.allDay !== o.allDay || tz !== o.tz) {
    patch.tz = tz;
    seriesChanged = true;
  }
  if (input.repeat !== undefined && input.repeat !== repeatOf(ctx.seriesRrule)) {
    patch.rrule = rruleOf(input.repeat, ctx.seriesRrule ?? null);
    seriesChanged = true;
  }
  return { kind: 'edit', occurrence: o, patch, seriesChanged, ...(input.reminders && { reminders: input.reminders }) };
}

/** The slot "New event" starts with: the next whole hour on `date`, an hour long. Wall times in, wall times out. */
export function newEventSlot(date: Date, now: Date): Span {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), now.getUTCHours() + 1));
  return { start, end: new Date(start.getTime() + 3_600_000) };
}
