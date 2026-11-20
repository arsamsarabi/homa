import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationError } from '../errors';
import { occurrencesWithOverrides } from '../events';
import { ICS_LIMITS, type IcsEvent, parseIcs } from './import';
import { WINDOWS_ZONES, zoneForTzid } from './zones';

const fixture = (name: string): string => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');
const opts = { floatingTz: 'Europe/London' };
const iso = (d: Date): string => d.toISOString();
const d = (s: string): Date => new Date(s);
const all = [d('1980-01-01T00:00:00Z'), d('2027-01-01T00:00:00Z')] as const;

/** The event's occurrences as the cache would hold them: overrides applied, cancelled ones gone. */
const occurrences = (e: IcsEvent, from = all[0], to = all[1]): { start: string; end: string; moved: boolean }[] =>
  occurrencesWithOverrides({ ...e, startAt: e.start, endAt: e.end }, e.overrides, from, to).map((o) => ({
    start: iso(o.start),
    end: iso(o.end),
    moved: o.start.getTime() !== o.recurrenceId.getTime(),
  }));

const byUid = (events: IcsEvent[], uid: string): IcsEvent => {
  const e = events.find((x) => x.uid.startsWith(uid));
  if (!e) throw new Error(`no event ${uid}`);
  return e;
};

/** A minimal calendar around some VEVENT lines. */
const ics = (...lines: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines: string[]): string[] => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];

describe('Google export', () => {
  const r = parseIcs(fixture('google.ics'), opts);

  test('reads every event and skips nothing', () => {
    expect(r.events).toHaveLength(3);
    expect(r).toMatchObject({ skipped: 0, warnings: [] });
  });

  test("keeps the feed's name", () => {
    expect(r.name).toBe('Ada Lovelace');
    expect(parseIcs(ics(), opts).name).toBeNull();
  });

  test('a weekly series across the clock change, with a moved and a cancelled occurrence', () => {
    const e = byUid(r.events, '7kukuqrfedlm2f9t0vr42q4ufp');
    expect(e).toMatchObject({
      summary: 'Stand-up',
      description: 'Daily plan, blockers\nand demos',
      location: 'Room 4',
      tz: 'Europe/London',
      allDay: false,
      rrule: 'FREQ=WEEKLY;COUNT=6;BYDAY=MO',
    });
    // The override keeps only what differs from the series.
    expect(e.overrides).toEqual([
      {
        recurrenceId: d('2026-03-30T08:00:00Z'),
        summary: 'Stand-up (late)',
        description: null,
        location: null,
        startAt: d('2026-03-30T09:00:00Z'),
        endAt: d('2026-03-30T09:15:00Z'),
      },
    ]);
    // 6 April is an EXDATE and 13 April a cancelled instance; 09:00 London is 08:00 UTC after 29 March.
    expect(occurrences(e)).toEqual([
      { start: '2026-03-16T09:00:00.000Z', end: '2026-03-16T09:15:00.000Z', moved: false },
      { start: '2026-03-23T09:00:00.000Z', end: '2026-03-23T09:15:00.000Z', moved: false },
      { start: '2026-03-30T09:00:00.000Z', end: '2026-03-30T09:15:00.000Z', moved: true },
      { start: '2026-04-20T08:00:00.000Z', end: '2026-04-20T08:15:00.000Z', moved: false },
    ]);
  });

  test('all-day events are UTC midnights', () => {
    expect(byUid(r.events, '3b1q2c9v')).toMatchObject({
      allDay: true,
      tz: 'UTC',
      start: d('2026-03-20T00:00:00Z'),
      end: d('2026-03-22T00:00:00Z'),
    });
  });

  test('UTC times stay UTC; attachments and X- properties are ignored', () => {
    expect(byUid(r.events, '0p9o8i7u')).toMatchObject({
      summary: 'Dentist',
      location: '12 High St, London',
      description: null,
      tz: 'UTC',
      start: d('2026-03-18T14:00:00Z'),
      rrule: null,
    });
  });
});

describe('Outlook export (Windows zone names, no VTIMEZONE)', () => {
  const r = parseIcs(fixture('outlook.ics'), opts);

  test('maps Windows names to IANA zones without warnings', () => {
    expect(r).toMatchObject({ skipped: 0, warnings: [] });
    expect(byUid(r.events, '040000008200E00074C5B7101A82E0080000000010').tz).toBe('America/Los_Angeles');
    expect(byUid(r.events, '040000008200E00074C5B7101A82E00800000000AABB')).toMatchObject({
      tz: 'Europe/Berlin',
      start: d('2026-03-25T13:00:00Z'),
    });
  });

  test('a series across the US clock change with a moved and an excluded week, up to UNTIL', () => {
    const e = byUid(r.events, '040000008200E00074C5B7101A82E0080000000010');
    // 8 March 2026: 09:00 Pacific goes from 17:00 to 16:00 UTC. The override keeps the title, so null.
    expect(e.overrides).toEqual([expect.objectContaining({ recurrenceId: d('2026-03-09T16:00:00Z'), summary: null })]);
    expect(occurrences(e).map((o) => o.start)).toEqual([
      '2026-03-02T17:00:00.000Z',
      '2026-03-09T18:00:00.000Z',
      '2026-03-23T16:00:00.000Z',
      '2026-03-30T16:00:00.000Z',
    ]);
  });

  test('all-day', () => {
    expect(byUid(r.events, '040000008200E00074C5B7101A82E00800000000112233')).toMatchObject({
      allDay: true,
      start: d('2026-04-01T00:00:00Z'),
      end: d('2026-04-02T00:00:00Z'),
    });
  });
});

describe('iCloud export', () => {
  const r = parseIcs(fixture('icloud.ics'), opts);

  test('a series with an RDATE and a moved occurrence across the Sydney clock change', () => {
    expect(r).toMatchObject({ skipped: 0, warnings: [] });
    const e = byUid(r.events, '5A3C1E2B');
    expect(e).toMatchObject({ tz: 'Australia/Sydney', location: 'Library', rdates: [d('2026-04-09T08:00:00Z')] });
    // 18:00 Sydney is 07:00 UTC until 5 April, then 08:00; the 12 April one moved to 19:00.
    expect(occurrences(e)).toEqual([
      { start: '2026-03-29T07:00:00.000Z', end: '2026-03-29T08:00:00.000Z', moved: false },
      { start: '2026-04-05T08:00:00.000Z', end: '2026-04-05T09:00:00.000Z', moved: false },
      { start: '2026-04-09T08:00:00.000Z', end: '2026-04-09T09:00:00.000Z', moved: false },
      { start: '2026-04-12T09:00:00.000Z', end: '2026-04-12T10:00:00.000Z', moved: true },
    ]);
    expect(e.overrides[0]?.summary).toBe('Book club: final chapter');
  });

  test('a yearly all-day birthday', () => {
    const e = byUid(r.events, '9C8B7A6D');
    expect(e).toMatchObject({ allDay: true, rrule: 'FREQ=YEARLY' });
    expect(occurrences(e, d('2026-01-01T00:00:00Z'), d('2027-01-01T00:00:00Z'))).toEqual([
      { start: '2026-05-12T00:00:00.000Z', end: '2026-05-13T00:00:00.000Z', moved: false },
    ]);
  });
});

describe('times and zones', () => {
  test('floating times use the given zone; DURATION sets the end', () => {
    const [e] = parseIcs(ics(...vevent('UID:f', 'DTSTART:20260701T090000', 'DURATION:PT90M')), {
      floatingTz: 'Asia/Tehran',
    }).events;
    expect(e).toMatchObject({ tz: 'Asia/Tehran', start: d('2026-07-01T05:30:00Z'), end: d('2026-07-01T07:00:00Z') });
  });

  test('an all-day event without an end lasts one day', () => {
    const [e] = parseIcs(ics(...vevent('UID:a', 'DTSTART;VALUE=DATE:20260701')), opts).events;
    expect(e?.end).toEqual(d('2026-07-02T00:00:00Z'));
  });

  test('a VTIMEZONE with X-LIC-LOCATION names the zone; an unknown TZID falls back to UTC once', () => {
    const r = parseIcs(
      ics(
        'BEGIN:VTIMEZONE',
        'TZID:Custom Tehran',
        'X-LIC-LOCATION:Asia/Tehran',
        'END:VTIMEZONE',
        ...vevent('UID:1', 'DTSTART;TZID=Custom Tehran:20260701T090000', 'DTEND;TZID=Custom Tehran:20260701T100000'),
        ...vevent('UID:2', 'DTSTART;TZID=Mars Time:20260701T090000', 'DTEND;TZID=Mars Time:20260701T100000'),
        ...vevent('UID:3', 'DTSTART;TZID=Mars Time:20260702T090000', 'DTEND;TZID=Mars Time:20260702T100000'),
      ),
      opts,
    );
    expect(r.events.map((e) => [e.tz, iso(e.start)])).toEqual([
      ['Asia/Tehran', '2026-07-01T05:30:00.000Z'],
      ['UTC', '2026-07-01T09:00:00.000Z'],
      ['UTC', '2026-07-02T09:00:00.000Z'],
    ]);
    expect(r.warnings).toEqual(['Unknown time zone "Mars Time": its times were read as UTC']);
  });

  test('zoneForTzid', () => {
    expect(zoneForTzid('/mozilla.org/20050126_1/America/New_York')).toBe('America/New_York');
    expect(zoneForTzid('"GMT Standard Time"')).toBe('Europe/London');
    expect(zoneForTzid('Pacific Standard Time (Mexico)')).toBe('America/Tijuana');
    expect(zoneForTzid('Something Else')).toBeUndefined();
    // Every mapped name must be a zone this runtime knows.
    for (const zone of Object.values(WINDOWS_ZONES)) expect(zoneForTzid(zone)).toBeTruthy();
  });
});

describe('hostile and broken input', () => {
  test('not iCalendar is a ValidationError with a reason', () => {
    expect(() => parseIcs('hello', opts)).toThrow(ValidationError);
    expect(() => parseIcs('hello', opts)).toThrow('Not a valid iCalendar file');
    expect(() => parseIcs('BEGIN:VEVENT\r\nEND:VEVENT', opts)).toThrow('expected BEGIN:VCALENDAR');
    expect(() => parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR', opts)).toThrow(ValidationError);
  });

  test('size and component caps', () => {
    expect(() => parseIcs(ics(`X-PAD:${'x'.repeat(ICS_LIMITS.maxBytes)}`), opts)).toThrow('larger than 5 MB');
    const many = Array.from({ length: ICS_LIMITS.maxComponents }, (_, i) => vevent(`UID:${i}`)).flat();
    expect(() => parseIcs(ics(...many), opts)).toThrow('more than 5000 components');
  });

  test('strings are bounded and stripped of control characters', () => {
    const [e] = parseIcs(
      ics(
        ...vevent('UID:s', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z', `SUMMARY:a\u0000b${'c'.repeat(600)}`),
      ),
      opts,
    ).events;
    expect(e?.summary.startsWith('abc')).toBe(true);
    expect(e?.summary).toHaveLength(ICS_LIMITS.summary);
  });

  test('bad events are skipped with a reason; the rest import', () => {
    const r = parseIcs(
      ics(
        ...vevent('DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z'),
        ...vevent('UID:nostart', 'SUMMARY:x'),
        ...vevent('UID:nolength', 'DTSTART:20260701T090000Z'),
        ...vevent('UID:backwards', 'DTSTART:20260701T090000Z', 'DTEND:20260701T080000Z'),
        ...vevent('UID:baddate', 'DTSTART:2026XX', 'DTEND:2026XX'),
        ...vevent('UID:badrule', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z', 'RRULE:BYDAY=MO'),
        ...vevent('UID:orphan', 'RECURRENCE-ID:20260701T090000Z', 'DTSTART:20260701T090000Z'),
        ...vevent('UID:gone', 'STATUS:CANCELLED', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z'),
        ...vevent('UID:ok', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z'),
        ...vevent('UID:ok', 'DTSTART:20260702T090000Z', 'DTEND:20260702T100000Z'),
      ),
      opts,
    );
    expect(r.events.map((e) => e.uid)).toEqual(['ok']);
    expect(r.skipped).toBe(9);
    expect(r.warnings).toEqual([
      'An event was skipped: no UID',
      'Event "nostart" skipped: no DTSTART',
      'Event "nolength" skipped: no length',
      'Event "backwards" skipped: an end that is not after its start',
      'Event "baddate" skipped: a value Homa cannot read',
      'Event "badrule" skipped: an RRULE Homa cannot read',
      'Event "gone" skipped: it is cancelled',
      'Event "ok" skipped: the UID is used twice',
      'Event "orphan" skipped: a changed occurrence without its series',
    ]);
  });

  test('warnings are capped', () => {
    const many = Array.from({ length: 80 }, (_, i) => vevent(`UID:${i}`)).flat();
    const r = parseIcs(ics(...many), opts);
    expect(r.skipped).toBe(80);
    expect(r.warnings).toHaveLength(ICS_LIMITS.maxWarnings);
  });
});

describe('alarms', () => {
  const alarm = (...lines: string[]): string[] => ['BEGIN:VALARM', ...lines, 'END:VALARM'];
  const event = (...alarms: string[][]): IcsEvent =>
    parseIcs(ics(...vevent('UID:a', 'DTSTART:20260316T090000Z', 'DTEND:20260316T091500Z', ...alarms.flat())), opts)
      .events[0] as IcsEvent;

  test('triggers before the start become reminders', () => {
    expect(
      event(
        alarm('ACTION:DISPLAY', 'TRIGGER:-PT10M', 'DESCRIPTION:x'),
        alarm('ACTION:EMAIL', 'TRIGGER;RELATED=START:-P1D', 'DESCRIPTION:x'),
        alarm('ACTION:AUDIO', 'TRIGGER:PT0S'),
      ).reminders,
    ).toEqual([
      { minutes: 0, action: 'display' },
      { minutes: 10, action: 'display' },
      { minutes: 1440, action: 'email' },
    ]);
  });

  test('absolute, end-relative and after-start triggers are skipped', () => {
    expect(
      event(
        alarm('ACTION:DISPLAY', 'TRIGGER;VALUE=DATE-TIME:20260316T080000Z'),
        alarm('ACTION:DISPLAY', 'TRIGGER;RELATED=END:-PT5M'),
        alarm('ACTION:DISPLAY', 'TRIGGER:PT5M'),
        alarm('ACTION:DISPLAY', 'TRIGGER:-P5W'),
      ).reminders,
    ).toEqual([]);
  });

  test('keeps at most five, one per offset', () => {
    const many = [1, 2, 3, 4, 5, 6, 2].map((m) => alarm('ACTION:DISPLAY', `TRIGGER:-PT${m}M`));
    expect(event(...many).reminders.map((r) => r.minutes)).toEqual([1, 2, 3, 4, 5]);
  });
});
