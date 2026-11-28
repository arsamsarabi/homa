import { describe, expect, test } from 'bun:test';
import { parseIcs, serializeEvent } from '@homa/core';
import { caldavProvider, icloud } from '.';

const vevent = (lines: string[]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:a',
    'SUMMARY:Dentist',
    'DTSTART:20270301T090000Z',
    'DTEND:20270301T100000Z',
    ...lines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

const read = (lines: string[]): number | null | undefined =>
  parseIcs(vevent(lines), { floatingTz: 'UTC', extension: icloud }).events[0]?.travelMinutes;

describe('icloud adaptor', () => {
  test('reads Apple travel time', () => {
    expect(read(['X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M'])).toBe(30);
    expect(read(['X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT1H30M'])).toBe(90);
    expect(read(['X-APPLE-TRAVEL-DURATION:PT15M'])).toBe(15);
  });

  test('no, unreadable or out-of-range travel time is none', () => {
    expect(read([])).toBeNull();
    expect(read(['X-APPLE-TRAVEL-DURATION:soon'])).toBeNull();
    expect(read(['X-APPLE-TRAVEL-DURATION;VALUE=DURATION:-PT30M'])).toBeNull();
    expect(read(['X-APPLE-TRAVEL-DURATION;VALUE=DURATION:P2D'])).toBeNull();
  });

  test('all-day events have none', () => {
    const ics = vevent(['X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M'])
      .replace('DTSTART:20270301T090000Z', 'DTSTART;VALUE=DATE:20270301')
      .replace('DTEND:20270301T100000Z', 'DTEND;VALUE=DATE:20270302');
    expect(parseIcs(ics, { floatingTz: 'UTC', extension: icloud }).events[0]?.travelMinutes).toBeNull();
  });

  test('without the adaptor, travel time is not read', () => {
    const ics = vevent(['X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M']);
    expect(parseIcs(ics, { floatingTz: 'UTC' }).events[0]?.travelMinutes).toBeUndefined();
  });

  test('writes travel time that reads back', () => {
    const [event] = parseIcs(vevent([]), { floatingTz: 'UTC' }).events;
    if (!event) throw new Error('no event');
    const stored = { ...event, startAt: event.start, endAt: event.end, travelMinutes: 45 };
    const ics = serializeEvent(stored, [], new Date(), [], icloud);
    expect(ics).toContain('X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT45M');
    expect(parseIcs(ics, { floatingTz: 'UTC', extension: icloud }).events[0]?.travelMinutes).toBe(45);
    expect(serializeEvent({ ...stored, travelMinutes: null }, [], new Date(), [], icloud)).not.toContain('X-APPLE');
  });

  test('picks iCloud by server host', () => {
    expect(caldavProvider('https://caldav.icloud.com')).toBe(icloud);
    expect(caldavProvider('https://p42-caldav.icloud.com:443/123/')).toBe(icloud);
    expect(caldavProvider('https://caldav.fastmail.com')).toBeUndefined();
    expect(caldavProvider('https://icloud.com.evil.example')).toBeUndefined();
    expect(caldavProvider('not a url')).toBeUndefined();
  });
});
