// Microsoft Graph (Outlook) events to and from Homa's series model.
//
// Pull: a series is a `seriesMaster` with a `recurrence` (patternedRecurrence), its changed
// occurrences (`exceptionOccurrences`, each with `originalStart`) and its cancelled ones
// (`cancelledOccurrences`, ids ending in the occurrence's date). The pattern becomes an RRULE, the
// cancelled dates EXDATEs and the exceptions RECURRENCE-ID VEVENTs, written out as one iCalendar
// object and read with the .ics import parser, as for Google and CalDAV. Times come in UTC (the
// adapter sends `Prefer: outlook.timezone="UTC"`); the event's own zone (`originalStartTimeZone`, a
// Windows or IANA name) places them, so recurrences keep their wall time across clock changes.
//
// Push: the event the outbox serialized is parsed back and becomes a Graph body. RRULEs Graph can't
// express (BYSETPOS without BYDAY, BYHOUR, hourly rules, RDATE …) are refused with a reason.
import { createHash } from 'node:crypto';
import { canonicalZone, type IcsEvent, type IcsOverride, parseIcs, WINDOWS_ZONES, zoneForTzid } from '@homa/core';

export type GraphTime = { dateTime: string; timeZone: string };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type Weekday = (typeof WEEKDAYS)[number];
const INDEXES = ['first', 'second', 'third', 'fourth', 'last'] as const;
type WeekIndex = (typeof INDEXES)[number];

export type RecurrencePattern = {
  type: 'daily' | 'weekly' | 'absoluteMonthly' | 'relativeMonthly' | 'absoluteYearly' | 'relativeYearly';
  interval: number;
  month?: number;
  dayOfMonth?: number;
  daysOfWeek?: Weekday[];
  firstDayOfWeek?: Weekday;
  index?: WeekIndex;
};
export type RecurrenceRange = {
  type: 'endDate' | 'noEnd' | 'numbered';
  startDate: string;
  endDate?: string;
  numberOfOccurrences?: number;
  recurrenceTimeZone?: string;
};
export type PatternedRecurrence = { pattern: RecurrencePattern; range: RecurrenceRange };

/** The fields of a Graph event Homa reads. */
export type GraphEvent = {
  id: string;
  changeKey?: string;
  type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
  subject?: string | null;
  body?: { contentType?: string; content?: string } | null;
  location?: { displayName?: string } | null;
  start?: GraphTime;
  end?: GraphTime;
  isAllDay?: boolean;
  isCancelled?: boolean;
  originalStart?: string | null;
  originalStartTimeZone?: string | null;
  iCalUId?: string;
  seriesMasterId?: string | null;
  recurrence?: PatternedRecurrence | null;
  singleValueExtendedProperties?: { id: string; value: string }[];
  exceptionOccurrences?: GraphEvent[];
  cancelledOccurrences?: string[];
  isReminderOn?: boolean;
  reminderMinutesBeforeStart?: number;
};

/**
 * A private named string property (MAPI) that keeps Homa's UID on events Homa creates: Graph makes
 * up its own iCalUId and has no way to set one. The GUID is Homa's own namespace.
 */
export const HOMA_UID_PROPERTY = 'String {4f1a8c52-7d36-4e0b-9a1f-6c2b3d8e5a71} Name homaUid';

/** The UID Homa knows a Graph event by. */
export const uidOf = (e: GraphEvent): string =>
  e.singleValueExtendedProperties?.find((p) => p.id.toLowerCase() === HOMA_UID_PROPERTY.toLowerCase())?.value ??
  e.iCalUId ??
  `${e.id}@outlook`;

/** A stable transactionId for a UID, so a retried create can't make a second event. */
export const transactionIdOf = (uid: string): string =>
  createHash('sha256').update(`homa:${uid}`).digest('hex').slice(0, 32);

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/;

/** The IANA zone for a Graph time zone name (Windows or IANA), or undefined. */
export const ianaZone = (name: string | null | undefined): string | undefined =>
  name ? (name.toUpperCase() === 'UTC' ? 'UTC' : zoneForTzid(name)) : undefined;

/** A Graph dateTime (a wall time in `timeZone`) as an instant, or null if it can't be read. */
export function instantOf(t: GraphTime | undefined): Date | null {
  if (!t?.dateTime) return null;
  const m = DATE_TIME.exec(t.dateTime);
  const zone = ianaZone(t.timeZone);
  if (!m || !zone) return null;
  try {
    const local = Temporal.PlainDateTime.from(t.dateTime.slice(0, 19));
    return new Date(local.toZonedDateTime(zone).epochMilliseconds);
  } catch {
    return null;
  }
}

/** iCalendar TEXT escaping; newlines become \n, so a value can't add a property. */
const esc = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

const localOf = (d: Date, zone: string): Temporal.PlainDateTime =>
  Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(zone).toPlainDateTime();
const basicLocal = (t: Temporal.PlainDateTime): string =>
  `${t.year}${pad(t.month)}${pad(t.day)}T${pad(t.hour)}${pad(t.minute)}${pad(t.second)}`;
/** 20270301T090000Z */
const basicUtc = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** A DTSTART-like line: the date (in `zone`) for all-day events, else the wall time in `zone`. */
function timeLine(name: string, at: Date | null, allDay: boolean, zone: string): string | null {
  if (!at) return null;
  if (allDay) return `${name};VALUE=DATE:${localOf(at, zone).toPlainDate().toString().replaceAll('-', '')}`;
  return zone === 'UTC' ? `${name}:${basicUtc(at)}` : `${name};TZID=${zone}:${basicLocal(localOf(at, zone))}`;
}

/** HTML bodies (when Graph ignores the text preference) become plain text. */
export function bodyText(body: GraphEvent['body']): string {
  const content = body?.content ?? '';
  if (body?.contentType?.toLowerCase() !== 'html') return content.trim();
  return content
    .replace(/<(br|\/p|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const textLines = (e: GraphEvent): string[] => {
  const description = bodyText(e.body);
  const location = e.location?.displayName ?? '';
  return [
    `SUMMARY:${esc(e.subject ?? '')}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
  ];
};

const DAY_CODE: Record<Weekday, string> = {
  sunday: 'SU',
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
};
const INDEX_NUMBER: Record<WeekIndex, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

/** "MO,TU" with the week index as a prefix for one day ("2MO"), or BYSETPOS for several (Outlook's "first weekday"). */
function relativeDays(p: RecurrencePattern): string {
  const days = (p.daysOfWeek ?? []).map((d) => DAY_CODE[d]);
  const n = INDEX_NUMBER[p.index ?? 'first'];
  return days.length === 1 ? `BYDAY=${n}${days[0]}` : `BYDAY=${days.join(',')};BYSETPOS=${n}`;
}

/** The RRULE value for a Graph recurrence, ending as Graph says (UNTIL at the end of its end date in `zone`). */
export function rruleOf(r: PatternedRecurrence, allDay: boolean, zone: string): string | null {
  const p = r.pattern;
  const interval = Math.max(1, Math.trunc(p.interval || 1));
  const parts: string[] = [];
  const days = (p.daysOfWeek ?? []).map((d) => DAY_CODE[d]).filter(Boolean);
  switch (p.type) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY');
      if (days.length) parts.push(`BYDAY=${days.join(',')}`);
      if (p.firstDayOfWeek && p.firstDayOfWeek !== 'monday') parts.push(`WKST=${DAY_CODE[p.firstDayOfWeek]}`);
      break;
    case 'absoluteMonthly':
      parts.push('FREQ=MONTHLY', `BYMONTHDAY=${p.dayOfMonth}`);
      break;
    case 'relativeMonthly':
      parts.push('FREQ=MONTHLY', relativeDays(p));
      break;
    case 'absoluteYearly':
      parts.push('FREQ=YEARLY', `BYMONTH=${p.month}`, `BYMONTHDAY=${p.dayOfMonth}`);
      break;
    case 'relativeYearly':
      parts.push('FREQ=YEARLY', `BYMONTH=${p.month}`, relativeDays(p));
      break;
    default:
      return null;
  }
  if (interval > 1) parts.splice(1, 0, `INTERVAL=${interval}`);
  if (r.range.type === 'numbered' && r.range.numberOfOccurrences)
    parts.push(`COUNT=${Math.trunc(r.range.numberOfOccurrences)}`);
  if (r.range.type === 'endDate' && r.range.endDate && /^\d{4}-\d{2}-\d{2}$/.test(r.range.endDate)) {
    const end = Temporal.PlainDate.from(r.range.endDate);
    parts.push(
      allDay
        ? `UNTIL=${r.range.endDate.replaceAll('-', '')}`
        : `UNTIL=${basicUtc(new Date(end.toZonedDateTime({ timeZone: zone, plainTime: '23:59:59' }).epochMilliseconds))}`,
    );
  }
  return parts.join(';');
}

/** The zone a Graph event's times are placed in: its own, else `fallback`. */
export const zoneOf = (e: GraphEvent, fallback: string): string =>
  ianaZone(e.originalStartTimeZone) ?? ianaZone(e.start?.timeZone) ?? fallback;

/**
 * The original starts of a series' cancelled occurrences. Graph gives only ids like
 * `OID.{master id}.2027-03-15`: the date, at the series' start time in its zone.
 * shortcut: the id's date part is how Graph's documented example reads, not a documented format;
 * switch to comparing `instances` with the expanded series if Microsoft changes it.
 */
export function cancelledStarts(master: GraphEvent, zone: string): Date[] {
  const start = instantOf(master.start);
  if (!start) return [];
  const time = master.isAllDay ? Temporal.PlainTime.from('00:00') : localOf(start, zone).toPlainTime();
  const out: Date[] = [];
  for (const id of master.cancelledOccurrences ?? []) {
    const m = /\.(\d{4}-\d{2}-\d{2})$/.exec(id);
    if (!m?.[1]) continue;
    const date = Temporal.PlainDate.from(m[1]);
    out.push(new Date(date.toZonedDateTime({ timeZone: zone, plainTime: time }).epochMilliseconds));
  }
  return out;
}

/** Outlook's one reminder as a VALARM, when it's on. */
const alarmLines = (e: GraphEvent): string[] => {
  const minutes = e.reminderMinutesBeforeStart;
  if (!e.isReminderOn || !Number.isInteger(minutes) || (minutes ?? -1) < 0) return [];
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${minutes}M`, 'DESCRIPTION:Reminder', 'END:VALARM'];
};

/** The series (or single event) as one VCALENDAR, in the shape parseIcs reads. */
export function seriesIcs(master: GraphEvent, floatingTz: string): string {
  const allDay = master.isAllDay === true;
  // All-day times are midnights in the event's zone (UTC when asked for UTC): their dates are read there.
  const zone = allDay ? (ianaZone(master.start?.timeZone) ?? 'UTC') : zoneOf(master, floatingTz);
  const uid = esc(uidOf(master));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homa//Microsoft sync//EN'];
  const vevent = (body: (string | null)[]): void => {
    lines.push('BEGIN:VEVENT', `UID:${uid}`, ...body.filter((l): l is string => l !== null), 'END:VEVENT');
  };
  const rrule = master.recurrence ? rruleOf(master.recurrence, allDay, zone) : null;
  vevent([
    timeLine('DTSTART', instantOf(master.start), allDay, zone),
    timeLine('DTEND', instantOf(master.end), allDay, zone),
    ...textLines(master),
    ...alarmLines(master),
    ...(rrule ? [`RRULE:${rrule}`] : []),
    ...(rrule ? cancelledStarts(master, zone).map((d) => timeLine('EXDATE', d, allDay, zone)) : []),
  ]);
  if (rrule)
    for (const x of master.exceptionOccurrences ?? []) {
      const original = x.originalStart ? new Date(x.originalStart) : null;
      if (!original || Number.isNaN(original.getTime())) continue;
      const rid = timeLine('RECURRENCE-ID', original, allDay, zone);
      if (x.isCancelled) vevent([rid, 'STATUS:CANCELLED']);
      else
        vevent([
          rid,
          timeLine('DTSTART', instantOf(x.start), allDay, zone),
          timeLine('DTEND', instantOf(x.end), allDay, zone),
          ...textLines(x),
        ]);
    }
  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

/** Reads a Graph series into Homa events (none if it can't be read: then `skipped` and a warning). */
export function readSeries(
  master: GraphEvent,
  floatingTz: string,
): { events: IcsEvent[]; skipped: number; warnings: string[] } {
  const { events, skipped, warnings } = parseIcs(seriesIcs(master, floatingTz), { floatingTz });
  return { events, skipped, warnings };
}

// --- Push ---

/** Graph's name for an IANA zone: the Windows name (CLDR) when there is one, else the IANA name. */
export function graphZone(tz: string): string {
  const zone = canonicalZone(tz) ?? tz;
  if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
  for (const [windows, iana] of Object.entries(WINDOWS_ZONES)) if (iana === zone) return windows;
  return zone;
}

const wallTime = (d: Date, zone: string): string => {
  const t = localOf(d, zone);
  return `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`;
};
/** A Graph time for an instant: the wall time in the event's zone, or a midnight for all-day dates. */
const graphTime = (d: Date, allDay: boolean, tz: string): GraphTime =>
  allDay
    ? { dateTime: `${d.toISOString().slice(0, 10)}T00:00:00`, timeZone: 'UTC' }
    : { dateTime: wallTime(d, tz), timeZone: graphZone(tz) };

/** An RRULE Graph can't hold. */
export class UnsupportedRecurrence extends Error {}

const CODE_DAY = Object.fromEntries(Object.entries(DAY_CODE).map(([k, v]) => [v, k])) as Record<string, Weekday>;
const NUMBER_INDEX: Record<string, WeekIndex> = {
  '1': 'first',
  '2': 'second',
  '3': 'third',
  '4': 'fourth',
  '-1': 'last',
};

/**
 * Graph's patternedRecurrence for an RRULE starting at `start` (in `tz`). Throws
 * UnsupportedRecurrence for what Outlook can't repeat that way.
 */
export function recurrenceOf(rrule: string, start: Date, allDay: boolean, tz: string): PatternedRecurrence {
  const parts = new Map<string, string>();
  for (const kv of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) parts.set(k.toUpperCase(), v.toUpperCase());
  }
  const known = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST']);
  for (const k of parts.keys()) if (!known.has(k)) throw new UnsupportedRecurrence(`Outlook can't repeat by ${k}`);
  const local = allDay ? Temporal.PlainDate.from(start.toISOString().slice(0, 10)) : localOf(start, tz).toPlainDate();
  const startDay = WEEKDAYS[local.dayOfWeek % 7] as Weekday;
  const interval = Number(parts.get('INTERVAL') ?? 1);
  const byday = parts.get('BYDAY')?.split(',') ?? [];
  const setpos = parts.get('BYSETPOS');
  const plainDays = (): Weekday[] =>
    byday.map((d) => {
      const day = CODE_DAY[d];
      if (!day) throw new UnsupportedRecurrence(`Outlook can't repeat on ${d} in this kind of rule`);
      return day;
    });
  const single = (k: string): number | undefined => {
    const v = parts.get(k);
    if (v === undefined) return undefined;
    if (!/^\d+$/.test(v)) throw new UnsupportedRecurrence(`Outlook can't repeat by ${k}=${v}`);
    return Number(v);
  };
  /** BYDAY with a week index: "2MO", or "MO,TU" with BYSETPOS. */
  const relative = (): Pick<RecurrencePattern, 'daysOfWeek' | 'index'> | null => {
    if (!byday.length) return null;
    const prefixed = byday.map((d) => /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d));
    if (prefixed.some((m) => !m)) throw new UnsupportedRecurrence(`Outlook can't repeat on ${byday.join(',')}`);
    const numbers = new Set(prefixed.map((m) => (m?.[1] ?? '').replace('+', '')));
    const [n] = numbers;
    if (numbers.size === 1 && n && !setpos) {
      const index = NUMBER_INDEX[n];
      if (!index) throw new UnsupportedRecurrence(`Outlook can't repeat on week ${n} of the month`);
      return { daysOfWeek: prefixed.map((m) => CODE_DAY[m?.[2] ?? ''] as Weekday), index };
    }
    if (numbers.size === 1 && n === '' && setpos && NUMBER_INDEX[setpos])
      return { daysOfWeek: plainDays(), index: NUMBER_INDEX[setpos] };
    throw new UnsupportedRecurrence(
      `Outlook can't repeat on ${byday.join(',')}${setpos ? ` (BYSETPOS=${setpos})` : ''}`,
    );
  };
  if (setpos && !byday.length) throw new UnsupportedRecurrence("Outlook can't repeat by BYSETPOS without days");
  if (!Number.isInteger(interval) || interval < 1)
    throw new UnsupportedRecurrence('The interval must be a whole number');

  let pattern: RecurrencePattern;
  const freq = parts.get('FREQ');
  if (freq === 'DAILY' && !byday.length && !parts.has('BYMONTHDAY') && !parts.has('BYMONTH'))
    pattern = { type: 'daily', interval };
  else if (freq === 'WEEKLY' || (freq === 'DAILY' && interval === 1 && byday.length && !setpos)) {
    if (parts.has('BYMONTHDAY') || parts.has('BYMONTH') || setpos)
      throw new UnsupportedRecurrence("Outlook can't limit a weekly repeat to some months or days of the month");
    const wkst = parts.get('WKST');
    pattern = {
      type: 'weekly',
      interval,
      daysOfWeek: byday.length ? plainDays() : [startDay],
      firstDayOfWeek: wkst ? (CODE_DAY[wkst] ?? 'monday') : 'monday',
    };
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const month = freq === 'YEARLY' ? (single('BYMONTH') ?? local.month) : undefined;
    const rel = relative();
    if (rel && parts.has('BYMONTHDAY'))
      throw new UnsupportedRecurrence("Outlook can't repeat by both days of the week and of the month");
    if (rel) pattern = { type: freq === 'YEARLY' ? 'relativeYearly' : 'relativeMonthly', interval, ...rel, month };
    else
      pattern = {
        type: freq === 'YEARLY' ? 'absoluteYearly' : 'absoluteMonthly',
        interval,
        dayOfMonth: single('BYMONTHDAY') ?? local.day,
        month,
      };
    if (month === undefined) delete pattern.month;
  } else throw new UnsupportedRecurrence(`Outlook can't repeat ${(freq ?? 'this way').toLowerCase()}`);

  const range: RecurrenceRange = { type: 'noEnd', startDate: local.toString() };
  const count = parts.get('COUNT');
  const until = parts.get('UNTIL');
  if (count) Object.assign(range, { type: 'numbered', numberOfOccurrences: Number(count) });
  else if (until) {
    const m = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(until);
    if (!m) throw new UnsupportedRecurrence(`Outlook can't read UNTIL=${until}`);
    const endDate = m[4]
      ? localOf(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[5]}:${m[6]}:${m[7]}Z`), allDay ? 'UTC' : tz)
          .toPlainDate()
          .toString()
      : `${m[1]}-${m[2]}-${m[3]}`;
    Object.assign(range, { type: 'endDate', endDate });
  }
  return { pattern, range };
}

export type GraphEventBody = {
  subject: string;
  body: { contentType: 'text'; content: string };
  location: { displayName: string };
  start: GraphTime;
  end: GraphTime;
  isAllDay: boolean;
  recurrence?: PatternedRecurrence | null;
  isReminderOn: boolean;
  reminderMinutesBeforeStart?: number;
};

/**
 * The fields Homa owns on the Graph event; others (attendees, online meetings) are left alone by a
 * PATCH. Outlook holds one reminder, so only the one closest to the start goes.
 */
export function graphBody(e: IcsEvent): GraphEventBody {
  if (e.rdates.length) throw new UnsupportedRecurrence("Outlook can't add single extra dates (RDATE) to a series");
  return {
    subject: e.summary,
    body: { contentType: 'text', content: e.description ?? '' },
    location: { displayName: e.location ?? '' },
    start: graphTime(e.start, e.allDay, e.tz),
    end: graphTime(e.end, e.allDay, e.tz),
    isAllDay: e.allDay,
    isReminderOn: e.reminders.length > 0,
    ...(e.reminders[0] ? { reminderMinutesBeforeStart: e.reminders[0].minutes } : {}),
    // Left out when there's none: a series can't be turned back into a single event from Homa yet.
    ...(e.rrule ? { recurrence: recurrenceOf(e.rrule, e.start, e.allDay, e.tz) } : {}),
  };
}

/** One changed occurrence, as a PATCH of that occurrence. Null fields take the series' value. */
export const occurrenceBody = (
  e: IcsEvent,
  o: IcsOverride,
): Omit<GraphEventBody, 'recurrence' | 'isAllDay' | 'isReminderOn' | 'reminderMinutesBeforeStart'> => ({
  subject: o.summary ?? e.summary,
  body: { contentType: 'text', content: o.description ?? e.description ?? '' },
  location: { displayName: o.location ?? e.location ?? '' },
  start: graphTime(o.startAt, e.allDay, e.tz),
  end: graphTime(o.endAt, e.allDay, e.tz),
});
