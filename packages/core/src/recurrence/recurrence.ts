// Expands a recurring event into occurrences. See docs/product/architecture.md
// ("Recurrence and the expansion cache" and "Phase 1 spike results").
//
// The RRULE is walked in floating local time with ical.js, and each local start is then placed
// in the event's IANA zone with Temporal. That keeps "09:00 every Monday" at 09:00 across
// clock changes without needing a VTIMEZONE, which many feeds leave out.
import ICAL from 'ical.js';

export type Series = {
  start: Date;
  end: Date;
  /** IANA zone the event was authored in. All-day events use UTC. */
  tz: string;
  /** RRULE value without the "RRULE:" prefix, or null for a single event. */
  rrule: string | null;
  /** Original starts of cancelled occurrences. */
  exdates: Date[];
};

export type Occurrence = {
  /** The occurrence's original start: the RECURRENCE-ID that overrides and EXDATEs refer to. */
  recurrenceId: Date;
  start: Date;
  end: Date;
};

/** Upper bound on occurrences produced for one series in one call. */
export const MAX_OCCURRENCES = 10_000;

/** Throws if `rrule` isn't a usable RRULE value. */
export function parseRrule(rrule: string): ICAL.Recur {
  const value = rrule.replace(/^RRULE:/i, '').trim();
  const recur = ICAL.Recur.fromString(value);
  if (!recur.freq) throw new Error('RRULE needs FREQ');
  return recur;
}

/** True if `tz` is an IANA time zone this runtime knows. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toLocal = (d: Date, tz: string): Temporal.PlainDateTime =>
  Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(tz).toPlainDateTime();

// RFC 5545 3.3.5: a local time skipped by a clock change moves forward by the gap ('compatible').
const toInstant = (t: ICAL.Time, tz: string): Date =>
  new Date(
    Temporal.PlainDateTime.from({
      year: t.year,
      month: t.month,
      day: t.day,
      hour: t.hour,
      minute: t.minute,
      second: t.second,
    }).toZonedDateTime(tz, { disambiguation: 'compatible' }).epochMilliseconds,
  );

const floating = (p: Temporal.PlainDateTime): ICAL.Time =>
  ICAL.Time.fromData({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second });

/** Occurrences of `series` that overlap [from, to), oldest first, without cancelled ones. */
export function expand(series: Series, from: Date, to: Date, limit = MAX_OCCURRENCES): Occurrence[] {
  const duration = series.end.getTime() - series.start.getTime();
  if (!series.rrule) {
    return series.start < to && series.end > from
      ? [{ recurrenceId: series.start, start: series.start, end: series.end }]
      : [];
  }

  const recur = parseRrule(series.rrule);
  // UNTIL is UTC (or a date) while we iterate in floating local time, so move it into the zone.
  if (recur.until) {
    const until = recur.until.isDate ? recur.until : floating(toLocal(recur.until.toJSDate(), series.tz));
    recur.until = until;
  }

  const skip = new Set(series.exdates.map((d) => d.getTime()));
  const it = recur.iterator(floating(toLocal(series.start, series.tz)));
  const out: Occurrence[] = [];
  for (let next = it.next(), seen = 0; next && seen < limit; next = it.next(), seen++) {
    const start = toInstant(next, series.tz);
    if (start >= to) break;
    const end = new Date(start.getTime() + duration);
    if (end > from && !skip.has(start.getTime())) out.push({ recurrenceId: start, start, end });
  }
  return out;
}

/** The series' RRULE ended just before `at`: for "this and following" edits and deletes. */
export function endBefore(rrule: string, at: Date): string {
  const recur = parseRrule(rrule);
  recur.count = null;
  recur.until = ICAL.Time.fromJSDate(new Date(at.getTime() - 1000), true);
  return recur.toString();
}

/** The RRULE for the part of a series from `at` on: COUNT reduced by the occurrences before it. */
export function continueFrom(series: Series & { rrule: string }, at: Date): string {
  const recur = parseRrule(series.rrule);
  if (recur.count) {
    const before = expand({ ...series, exdates: [] }, series.start, at).length;
    recur.count = Math.max(1, recur.count - before);
  }
  return recur.toString();
}
