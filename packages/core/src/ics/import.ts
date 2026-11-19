// Reads an iCalendar (.ics) file into events Homa can store. The file is treated as hostile: it is
// size- and component-capped, nothing in it is fetched (URLs, ATTACH), alarms and X- properties are
// ignored, every string is bounded, and one bad event is skipped with a warning, not fatal.
//
// Times: each DATE-TIME is read as wall-clock fields plus its TZID, and placed with Temporal in the
// IANA zone that TZID maps to (zones.ts). A file's VTIMEZONE rules are never run, as in expansion.
// See docs/product/architecture.md ("ICS import and JSON export").
import ICAL from 'ical.js';
import { ValidationError } from '../errors';
import { parseRrule } from '../recurrence';
import { zoneForTzid } from './zones';

export const ICS_LIMITS = {
  /** Largest file, in bytes. */
  maxBytes: 5 * 1024 * 1024,
  /** Most components (BEGIN: lines) in one file. */
  maxComponents: 5_000,
  /** Most EXDATEs or RDATEs kept per event. */
  maxDates: 1_000,
  /** Most occurrences one import may add to the instance cache. */
  maxOccurrences: 200_000,
  /** Most warnings returned. */
  maxWarnings: 50,
  summary: 500,
  description: 10_000,
  location: 500,
  uid: 255,
  rrule: 1_000,
} as const;

export type IcsOverride = {
  recurrenceId: Date;
  /** Null when the same as the series, so it follows later changes to the series. */
  summary: string | null;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
};

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  tz: string;
  rrule: string | null;
  exdates: Date[];
  rdates: Date[];
  overrides: IcsOverride[];
};

export type IcsImport = {
  events: IcsEvent[];
  /** VEVENTs left out (each has a warning, up to the cap). */
  skipped: number;
  warnings: string[];
};

export type IcsOptions = {
  /** IANA zone for floating times (no TZID, no Z): the user's home zone. */
  floatingTz: string;
};

const DAY_MS = 86_400_000;

/** A problem with one event: it is skipped and the message becomes a warning. */
class SkipEvent extends Error {}

/** Drops control characters but tab and newlines (Postgres text can't hold NUL) and caps the length. */
function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[^\P{Cc}\t\n\r]/gu, '')
    .trim()
    .slice(0, max);
}
const cleanOrNull = (value: unknown, max: number): string | null => clean(value, max) || null;

/** Throws ValidationError unless `text` is within the size and component limits. */
function checkLimits(text: string): void {
  if (new TextEncoder().encode(text).length > ICS_LIMITS.maxBytes)
    throw new ValidationError(`The file is larger than ${ICS_LIMITS.maxBytes / 1024 / 1024} MB`);
  const components = text.match(/^BEGIN:/gim)?.length ?? 0;
  if (components > ICS_LIMITS.maxComponents)
    throw new ValidationError(`The file has more than ${ICS_LIMITS.maxComponents} components`);
}

/** The VCALENDAR components in `text`. Throws ValidationError if it isn't iCalendar. */
function calendarsIn(text: string): ICAL.Component[] {
  let jcal: unknown;
  try {
    jcal = ICAL.parse(text);
  } catch (err) {
    throw new ValidationError(`Not a valid iCalendar file: ${(err as Error).message.slice(0, 200)}`);
  }
  // One calendar parses to ['vcalendar', …]; several to [['vcalendar', …], …].
  const list = (Array.isArray(jcal) && typeof jcal[0] === 'string' ? [jcal] : jcal) as unknown[];
  if (!Array.isArray(list) || list.length === 0 || list.some((c) => !Array.isArray(c) || c[0] !== 'vcalendar'))
    throw new ValidationError('Not a valid iCalendar file: expected BEGIN:VCALENDAR');
  // biome-ignore lint/suspicious/noExplicitAny: ical.js types jCal loosely; the shape is checked above.
  return list.map((c) => new ICAL.Component(c as any));
}

/** Reads times in one file: TZIDs to IANA zones, with a warning once per unknown TZID. */
class Clock {
  private readonly zones = new Map<string, string>();
  constructor(
    private readonly locations: ReadonlyMap<string, string>,
    private readonly floatingTz: string,
    private readonly warn: (message: string) => void,
  ) {}

  zone(tzid: string): string {
    let zone = this.zones.get(tzid);
    if (!zone) {
      zone = zoneForTzid(tzid, this.locations.get(tzid));
      if (!zone) this.warn(`Unknown time zone "${clean(tzid, 60)}": its times were read as UTC`);
      zone = zone ?? 'UTC';
      this.zones.set(tzid, zone);
    }
    return zone;
  }

  /** The zone a value is in: 'UTC' for dates and Z times, its TZID's zone, or the floating zone. */
  zoneOf(t: ICAL.Time, tzid: string | undefined): string {
    if (t.isDate || t.zone?.tzid === 'UTC') return 'UTC';
    return tzid ? this.zone(tzid) : this.floatingTz;
  }

  instant(t: ICAL.Time, tzid: string | undefined): Date {
    const zone = this.zoneOf(t, tzid);
    const ms = Temporal.PlainDateTime.from(
      { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second },
      { overflow: 'reject' },
    ).toZonedDateTime(zone, { disambiguation: 'compatible' }).epochMilliseconds;
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    if (!(year >= 1000 && year <= 9999)) throw new SkipEvent('a date outside the years 1000 to 9999');
    return date;
  }
}

const tzidOf = (p: ICAL.Property): string | undefined => {
  const v = p.getParameter('tzid');
  return typeof v === 'string' ? v : undefined;
};

function timeProp(e: ICAL.Component, name: string): { time: ICAL.Time; tzid: string | undefined } | undefined {
  const p = e.getFirstProperty(name);
  const v = p?.getFirstValue();
  return p && v instanceof ICAL.Time ? { time: v, tzid: tzidOf(p) } : undefined;
}

/** Every value of a multi-valued date property (EXDATE, RDATE), as instants. */
function dateList(e: ICAL.Component, name: string, clock: Clock): Date[] {
  const out: Date[] = [];
  for (const p of e.getAllProperties(name)) {
    for (const v of p.getValues()) {
      // An RDATE can be a PERIOD; only its start matters, as occurrences take the series' length.
      const t = v instanceof ICAL.Period ? v.start : v;
      if (t instanceof ICAL.Time) out.push(clock.instant(t, tzidOf(p)));
    }
  }
  return out;
}

/** Start and end of a VEVENT (or an overridden occurrence), and whether it's all-day. */
function span(
  e: ICAL.Component,
  clock: Clock,
  fallbackMs?: number,
): { start: Date; end: Date; allDay: boolean; tz: string } {
  const dtstart = timeProp(e, 'dtstart');
  if (!dtstart) throw new SkipEvent('no DTSTART');
  const allDay = dtstart.time.isDate;
  const start = clock.instant(dtstart.time, dtstart.tzid);
  const dtend = timeProp(e, 'dtend');
  const duration = e.getFirstPropertyValue('duration');
  let end: Date;
  if (dtend) end = clock.instant(dtend.time, dtend.tzid);
  else if (duration instanceof ICAL.Duration) end = new Date(start.getTime() + duration.toSeconds() * 1000);
  else end = new Date(start.getTime() + (fallbackMs ?? (allDay ? DAY_MS : 0)));
  if (end <= start) throw new SkipEvent(dtend || duration ? 'an end that is not after its start' : 'no length');
  return { start, end, allDay, tz: clock.zoneOf(dtstart.time, dtstart.tzid) };
}

const isCancelled = (e: ICAL.Component): boolean =>
  clean(e.getFirstPropertyValue('status'), 20).toUpperCase() === 'CANCELLED';

function capDates(dates: Date[], what: string, uid: string, warn: (m: string) => void): Date[] {
  if (dates.length > ICS_LIMITS.maxDates) warn(`Event "${uid}": only the first ${ICS_LIMITS.maxDates} ${what} kept`);
  return dates.slice(0, ICS_LIMITS.maxDates);
}

function readRrule(e: ICAL.Component): string | null {
  const recur = e.getFirstPropertyValue('rrule');
  if (!recur) return null;
  const value = String(recur);
  if (value.length > ICS_LIMITS.rrule) throw new SkipEvent('an RRULE that is too long');
  try {
    parseRrule(value);
  } catch {
    throw new SkipEvent('an RRULE Homa cannot read');
  }
  return value;
}

function readMaster(e: ICAL.Component, uid: string, clock: Clock, warn: (m: string) => void): IcsEvent {
  const { start, end, allDay, tz } = span(e, clock);
  const rrule = readRrule(e);
  return {
    uid,
    summary: clean(e.getFirstPropertyValue('summary'), ICS_LIMITS.summary),
    description: cleanOrNull(e.getFirstPropertyValue('description'), ICS_LIMITS.description),
    location: cleanOrNull(e.getFirstPropertyValue('location'), ICS_LIMITS.location),
    start,
    end,
    allDay,
    tz,
    rrule,
    exdates: capDates(dateList(e, 'exdate', clock), 'EXDATEs', uid, warn),
    rdates: capDates(dateList(e, 'rdate', clock), 'RDATEs', uid, warn),
    overrides: [],
  };
}

/** Applies one RECURRENCE-ID component to its series: an override, or an EXDATE if cancelled. */
function applyInstance(master: IcsEvent, e: ICAL.Component, clock: Clock): void {
  const rid = timeProp(e, 'recurrence-id');
  if (!rid) throw new SkipEvent('no RECURRENCE-ID');
  const recurrenceId = clock.instant(rid.time, rid.tzid);
  if (isCancelled(e)) {
    master.exdates.push(recurrenceId);
    return;
  }
  const { start, end } = span(e, clock, master.end.getTime() - master.start.getTime());
  const own = (value: string | null, of: string | null): string | null => (value === of ? null : value);
  master.overrides.push({
    recurrenceId,
    summary: own(clean(e.getFirstPropertyValue('summary'), ICS_LIMITS.summary), master.summary),
    description: own(cleanOrNull(e.getFirstPropertyValue('description'), ICS_LIMITS.description), master.description),
    location: own(cleanOrNull(e.getFirstPropertyValue('location'), ICS_LIMITS.location), master.location),
    startAt: start,
    endAt: end,
  });
}

/**
 * Parses an .ics file into events. Throws ValidationError when the file is too big, has too many
 * components or isn't iCalendar; events Homa can't use are skipped with a warning.
 *
 * @example parseIcs(text, { floatingTz: 'Europe/London' }).events
 */
export function parseIcs(text: string, options: IcsOptions): IcsImport {
  checkLimits(text);
  const calendars = calendarsIn(text);

  const warnings: string[] = [];
  const warn = (message: string): void => {
    if (warnings.length < ICS_LIMITS.maxWarnings) warnings.push(message);
  };
  let skipped = 0;
  const skip = (uid: string, reason: string): void => {
    skipped++;
    warn(uid ? `Event "${uid}" skipped: ${reason}` : `An event was skipped: ${reason}`);
  };

  const events = new Map<string, IcsEvent>();
  const instances: { uid: string; e: ICAL.Component }[] = [];

  for (const cal of calendars) {
    const locations = new Map<string, string>();
    for (const vtz of cal.getAllSubcomponents('vtimezone')) {
      const tzid = vtz.getFirstPropertyValue('tzid');
      const location = vtz.getFirstPropertyValue('x-lic-location');
      if (typeof tzid === 'string' && typeof location === 'string') locations.set(tzid, location);
    }
    const clock = new Clock(locations, options.floatingTz, warn);

    for (const e of cal.getAllSubcomponents('vevent')) {
      const uid = clean(e.getFirstPropertyValue('uid'), ICS_LIMITS.uid + 1);
      try {
        if (!uid) throw new SkipEvent('no UID');
        if (uid.length > ICS_LIMITS.uid) throw new SkipEvent('a UID longer than 255 characters');
        if (e.hasProperty('recurrence-id')) {
          instances.push({ uid, e });
          continue;
        }
        if (events.has(uid)) throw new SkipEvent('the UID is used twice');
        if (isCancelled(e)) throw new SkipEvent('it is cancelled');
        events.set(uid, readMaster(e, uid, clock, warn));
      } catch (err) {
        // A malformed value inside one event (a bad date, say) skips that event, not the file.
        skip(uid.slice(0, 80), err instanceof SkipEvent ? err.message : 'a value Homa cannot read');
      }
    }

    // After every master is known, since an instance can come before its series in the file.
    for (const { uid, e } of instances.splice(0)) {
      const master = events.get(uid);
      try {
        if (!master) throw new SkipEvent('a changed occurrence without its series');
        if (!master.rrule && master.rdates.length === 0) throw new SkipEvent('a changed occurrence of a single event');
        applyInstance(master, e, clock);
      } catch (err) {
        skip(uid.slice(0, 80), err instanceof SkipEvent ? err.message : 'a value Homa cannot read');
      }
    }
  }

  return { events: [...events.values()], skipped, warnings };
}
