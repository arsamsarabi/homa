// Writes one stored event (a series with its overrides, or a single event) as an iCalendar object,
// the body a CalDAV PUT sends. Times are written as wall-clock fields with the event's IANA zone as
// TZID (UTC events as Z times, all-day events as dates), the same way parseIcs reads them back.
//
// shortcut: no VTIMEZONE is written (RFC 5545 asks for one per TZID); Radicale, Nextcloud and
// Fastmail accept IANA TZIDs without it. Generate one from Temporal transitions if a server refuses.
import ICAL from 'ical.js';

export type SerializableEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  tz: string;
  rrule: string | null;
  exdates: readonly Date[];
  rdates: readonly Date[];
};

export type SerializableOverride = {
  recurrenceId: Date;
  /** Null inherits the series' value. */
  summary: string | null;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
};

/** An instant as an ical.js time: a date (all-day), a Z time (UTC) or wall-clock fields in `tz`. */
function timeOf(d: Date, allDay: boolean, tz: string): ICAL.Time {
  if (allDay)
    return ICAL.Time.fromData({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      isDate: true,
    });
  if (tz === 'UTC') return ICAL.Time.fromJSDate(d, true);
  const z = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(tz);
  return ICAL.Time.fromData({
    year: z.year,
    month: z.month,
    day: z.day,
    hour: z.hour,
    minute: z.minute,
    second: z.second,
  });
}

function addTime(c: ICAL.Component, name: string, d: Date, e: SerializableEvent): void {
  const p = new ICAL.Property(name, c);
  if (!e.allDay && e.tz !== 'UTC') p.setParameter('tzid', e.tz);
  p.setValue(timeOf(d, e.allDay, e.tz));
  c.addProperty(p);
}

function addText(c: ICAL.Component, name: string, value: string | null): void {
  if (value) c.addPropertyWithValue(name, value);
}

function vevent(e: SerializableEvent, stamp: ICAL.Time): ICAL.Component {
  const c = new ICAL.Component('vevent');
  c.addPropertyWithValue('uid', e.uid);
  c.addPropertyWithValue('dtstamp', stamp);
  return c;
}

/**
 * The event and its overrides as one VCALENDAR.
 * @example serializeEvent(event, overrides) // "BEGIN:VCALENDAR\r\n…"
 */
export function serializeEvent(
  e: SerializableEvent,
  overrides: readonly SerializableOverride[] = [],
  now = new Date(),
): string {
  const cal = new ICAL.Component('vcalendar');
  cal.addPropertyWithValue('version', '2.0');
  cal.addPropertyWithValue('prodid', '-//Homa//Calendar//EN');
  const stamp = ICAL.Time.fromJSDate(now, true);

  const master = vevent(e, stamp);
  addTime(master, 'dtstart', e.startAt, e);
  addTime(master, 'dtend', e.endAt, e);
  master.addPropertyWithValue('summary', e.summary);
  addText(master, 'description', e.description);
  addText(master, 'location', e.location);
  if (e.rrule) master.addPropertyWithValue('rrule', ICAL.Recur.fromString(e.rrule));
  for (const d of e.exdates) addTime(master, 'exdate', d, e);
  for (const d of e.rdates) addTime(master, 'rdate', d, e);
  cal.addSubcomponent(master);

  for (const o of overrides) {
    const c = vevent(e, stamp);
    addTime(c, 'recurrence-id', o.recurrenceId, e);
    addTime(c, 'dtstart', o.startAt, e);
    addTime(c, 'dtend', o.endAt, e);
    c.addPropertyWithValue('summary', o.summary ?? e.summary);
    addText(c, 'description', o.description ?? e.description);
    addText(c, 'location', o.location ?? e.location);
    cal.addSubcomponent(c);
  }
  return `${cal.toString()}\r\n`;
}
