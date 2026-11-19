// Phase 1 spike: can Bun parse and expand real-world recurring events correctly?
// Case: a weekly Monday 09:00 meeting in Europe/London across the March 2026 clock change
// (Sunday 29 March, GMT → BST), with one cancelled occurrence (EXDATE) and one moved
// occurrence (RECURRENCE-ID). Results are summarised in docs/product/architecture.md.
import { describe, expect, test } from 'bun:test';
import ICAL from 'ical.js';
import { rrulestr } from 'rrule';

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:GMT
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

const ics = (withTimezone: boolean) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//homa//spike//EN',
    ...(withTimezone ? [VTIMEZONE] : []),
    'BEGIN:VEVENT',
    'UID:standup@homa.test',
    'DTSTAMP:20260301T000000Z',
    'SUMMARY:Stand-up',
    'DTSTART;TZID=Europe/London:20260316T090000',
    'DTEND;TZID=Europe/London:20260316T091500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5',
    'EXDATE;TZID=Europe/London:20260323T090000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:standup@homa.test',
    'DTSTAMP:20260301T000000Z',
    'SUMMARY:Stand-up (moved)',
    'RECURRENCE-ID;TZID=Europe/London:20260330T090000',
    'DTSTART;TZID=Europe/London:20260330T100000',
    'DTEND;TZID=Europe/London:20260330T101500',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

// What a correct expander must produce, in UTC:
const expected = [
  '2026-03-16T09:00:00.000Z', // GMT
  // 23 March cancelled by EXDATE
  '2026-03-30T09:00:00.000Z', // moved to 10:00 BST
  '2026-04-06T08:00:00.000Z', // 09:00 BST
  '2026-04-13T08:00:00.000Z',
];

function expandWithIcalJs(source: string) {
  const vcal = new ICAL.Component(ICAL.parse(source));
  for (const tz of vcal.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);
  const [master, ...overrides] = vcal.getAllSubcomponents('vevent').map((c) => new ICAL.Event(c));
  if (!master) throw new Error('no VEVENT');
  for (const o of overrides) master.relateException(o);
  const it = master.iterator();
  const out: { start: string; summary: string }[] = [];
  for (let next = it.next(); next; next = it.next()) {
    const d = master.getOccurrenceDetails(next);
    out.push({ start: d.startDate.toJSDate().toISOString(), summary: d.item.summary });
  }
  return out;
}

describe('ical.js', () => {
  test('expands with EXDATE, RECURRENCE-ID and the DST change when the feed has VTIMEZONE', () => {
    const occ = expandWithIcalJs(ics(true));
    expect(occ.map((o) => o.start)).toEqual(expected);
    expect(occ[1]?.summary).toBe('Stand-up (moved)');
  });

  test('without VTIMEZONE in the feed, TZID needs a timezone source', () => {
    ICAL.TimezoneService.reset();
    const occ = expandWithIcalJs(ics(false));
    // Finding: ical.js treats the unknown TZID as floating time, so the clock change is lost.
    // Homa must register IANA zones itself (e.g. built from Temporal / Intl) before expanding.
    expect(occ.map((o) => o.start)).not.toEqual(expected);
  });
});

describe('rrule', () => {
  test('is only right when the process runs in UTC, and ignores EXDATE and overrides', () => {
    // bun test runs with TZ=UTC. Measured by hand for the same rule:
    //   TZ=UTC              03-16T09:00 03-23T09:00 03-30T08:00 04-06T08:00 (correct)
    //   TZ=Europe/London    03-16T09:00 ... 04-06T09:00 (one hour off after the change)
    //   TZ=America/New_York 03-16T05:00 ... (four or five hours off)
    // Finding: rrule's TZID support depends on the host's local zone, and this RRULE-only
    // input has no idea about the EXDATE or the moved occurrence. Not used for expansion.
    const rule = rrulestr('DTSTART;TZID=Europe/London:20260316T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toMatch(/UTC/);
    expect(rule.all().map((d) => d.toISOString())).toEqual([
      '2026-03-16T09:00:00.000Z',
      '2026-03-23T09:00:00.000Z',
      '2026-03-30T08:00:00.000Z',
      '2026-04-06T08:00:00.000Z',
      '2026-04-13T08:00:00.000Z',
    ]);
  });
});

describe('Temporal (native in Bun 1.4)', () => {
  test('keeps 09:00 local across the clock change', () => {
    const start = Temporal.ZonedDateTime.from('2026-03-16T09:00[Europe/London]');
    const later = start.add({ weeks: 3 });
    expect(later.toString()).toBe('2026-04-06T09:00:00+01:00[Europe/London]');
    expect(later.toInstant().toString()).toBe('2026-04-06T08:00:00Z');
  });
});
