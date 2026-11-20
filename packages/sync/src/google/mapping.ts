// Google Calendar events to and from Homa's series model.
//
// Pull: a Google series is a master event (its `recurrence` holds RRULE, EXDATE and RDATE lines) plus
// one event per changed or cancelled occurrence (`recurringEventId` and `originalStartTime`). They
// are written out as one iCalendar object (a VEVENT per event, RECURRENCE-ID for occurrences) and read
// with the .ics import parser, so Google events get the same limits, zone handling and recurrence
// checks as an import or a CalDAV pull. All-day events use `date` (end exclusive); timed ones
// `dateTime` with `timeZone`, else the calendar's zone.
//
// Push: the event as the outbox serialized it is parsed back and becomes a Google event body; each
// override is a patch of its instance.
import { createHash } from 'node:crypto';
import { type IcsEvent, type IcsOverride, parseIcs } from '@homa/core';

export type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };

/** The fields of a Google Calendar event Homa reads. */
export type GoogleEvent = {
  id: string;
  etag?: string;
  status?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleTime;
  eventType?: string;
};

/** A series (or single event) as Google holds it: the master and its changed or cancelled occurrences. */
export type GoogleSeries = { master: GoogleEvent; exceptions: GoogleEvent[] };

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
const ZONE_NAME = /^[A-Za-z0-9_+\-/]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** iCalendar TEXT escaping; newlines become \n, so a value can't add a property. */
const esc = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/** A DTSTART-like line for a Google time, or null if it has neither a valid date nor dateTime. */
function timeLine(name: string, t: GoogleTime | undefined, calendarTz: string): string | null {
  if (t?.date && DATE.test(t.date)) return `${name};VALUE=DATE:${t.date.replaceAll('-', '')}`;
  if (!t?.dateTime) return null;
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(t.dateTime);
  } catch {
    return null;
  }
  for (const zone of [t.timeZone, calendarTz]) {
    if (!zone || !ZONE_NAME.test(zone)) continue;
    try {
      const z = instant.toZonedDateTimeISO(zone);
      return `${name};TZID=${zone}:${z.year}${pad(z.month)}${pad(z.day)}T${pad(z.hour)}${pad(z.minute)}${pad(z.second)}`;
    } catch {
      // An unknown zone: try the next one, then UTC.
    }
  }
  return `${name}:${basicUtc(new Date(instant.epochMilliseconds))}`;
}

const textLines = (e: GoogleEvent): string[] => [
  `SUMMARY:${esc(e.summary ?? '')}`,
  ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
  ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
];

/** Google's recurrence lines, minus anything that isn't RRULE, RDATE or EXDATE (EXRULE isn't supported). */
const recurrenceLines = (e: GoogleEvent): string[] =>
  (e.recurrence ?? []).filter((l) => /^(RRULE|RDATE|EXDATE)[;:][^\r\n]*$/i.test(l));

/** The series as one VCALENDAR, in the shape parseIcs reads. */
export function seriesIcs(series: GoogleSeries, calendarTz: string): string {
  const { master } = series;
  const uid = esc(master.iCalUID ?? `${master.id}@google.com`);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homa//Google sync//EN'];
  const vevent = (body: (string | null)[]): void => {
    lines.push('BEGIN:VEVENT', `UID:${uid}`, ...body.filter((l): l is string => l !== null), 'END:VEVENT');
  };
  vevent([
    timeLine('DTSTART', master.start, calendarTz),
    timeLine('DTEND', master.end, calendarTz),
    ...textLines(master),
    ...recurrenceLines(master),
  ]);
  for (const x of series.exceptions) {
    const rid = timeLine('RECURRENCE-ID', x.originalStartTime, calendarTz);
    if (!rid) continue;
    if (x.status === 'cancelled') vevent([rid, 'STATUS:CANCELLED']);
    else vevent([rid, timeLine('DTSTART', x.start, calendarTz), timeLine('DTEND', x.end, calendarTz), ...textLines(x)]);
  }
  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

/** Reads a Google series into Homa events (none if it can't be read: then `skipped` and a warning). */
export function readSeries(
  series: GoogleSeries,
  calendarTz: string,
  floatingTz: string,
): { events: IcsEvent[]; skipped: number; warnings: string[] } {
  const { events, skipped, warnings } = parseIcs(seriesIcs(series, calendarTz), { floatingTz });
  return { events, skipped, warnings };
}

// --- Push ---

/** Google event ids are 5–1024 characters of base32hex; a SHA-256 in hex is, and it's stable per UID. */
export const googleEventId = (uid: string): string => createHash('sha256').update(uid).digest('hex');

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
/** 20270301T090000Z */
export const basicUtc = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

const gtime = (d: Date, allDay: boolean, tz: string): GoogleTime =>
  allDay ? { date: isoDate(d) } : { dateTime: d.toISOString(), timeZone: tz };

const dateValue = (d: Date, allDay: boolean): string =>
  allDay ? `;VALUE=DATE:${isoDate(d).replaceAll('-', '')}` : `:${basicUtc(d)}`;

export type GoogleEventBody = {
  summary: string;
  description: string;
  location: string;
  start: GoogleTime;
  end: GoogleTime;
  recurrence?: string[];
};

/** The fields Homa owns on the Google event; others (guests, reminders, meeting links) are left alone by a patch. */
export function googleBody(e: IcsEvent): GoogleEventBody {
  const recurrence = [
    ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
    ...e.exdates.map((d) => `EXDATE${dateValue(d, e.allDay)}`),
    ...e.rdates.map((d) => `RDATE${dateValue(d, e.allDay)}`),
  ];
  return {
    summary: e.summary,
    // Google clears a field patched with an empty string.
    description: e.description ?? '',
    location: e.location ?? '',
    start: gtime(e.start, e.allDay, e.tz),
    end: gtime(e.end, e.allDay, e.tz),
    // Left out when empty: a series can't be turned back into a single event from Homa yet.
    ...(recurrence.length ? { recurrence } : {}),
  };
}

/** One changed occurrence, as a patch of its instance. Null fields take the series' value. */
export const instanceBody = (e: IcsEvent, o: IcsOverride): GoogleEventBody => ({
  summary: o.summary ?? e.summary,
  description: o.description ?? e.description ?? '',
  location: o.location ?? e.location ?? '',
  start: gtime(o.startAt, e.allDay, e.tz),
  end: gtime(o.endAt, e.allDay, e.tz),
});

/**
 * The id Google gives an occurrence of a series: the series id, `_` and the original start (a date
 * for all-day series, else a UTC time).
 * shortcut: a Google convention, not documented; switch to events.instances?originalStart if it changes.
 */
export const instanceId = (seriesId: string, recurrenceId: Date, allDay: boolean): string =>
  `${seriesId}_${allDay ? isoDate(recurrenceId).replaceAll('-', '') : basicUtc(recurrenceId)}`;
