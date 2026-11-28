import { describe, expect, test } from 'bun:test';
import { ValidationError } from '../errors';
import { overrideValues, planChange, planDelete } from './changes';

const d = (s: string): Date => new Date(s);
// Weekly Monday 09:00 London stand-up from 16 March 2026, five times, across the clock change.
const standup = {
  startAt: d('2026-03-16T09:00:00Z'),
  endAt: d('2026-03-16T09:15:00Z'),
  tz: 'Europe/London',
  rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=5',
  exdates: [d('2026-03-23T09:00:00Z')],
};
const single = { ...standup, rrule: null, exdates: [] };

describe('planChange', () => {
  test('a single event changes as a whole, keeping its length when only the start moves', () => {
    expect(planChange(single, { start: d('2026-03-16T10:00:00Z') }, 'this')).toEqual({
      kind: 'series',
      start: d('2026-03-16T10:00:00Z'),
      end: d('2026-03-16T10:15:00Z'),
      exdates: [],
      rdates: [],
      shiftMs: 3_600_000,
      durationMs: 900_000,
    });
  });

  test('scope=all moves the exdates with the series', () => {
    const plan = planChange(standup, { start: d('2026-03-16T10:00:00Z') }, 'all');
    expect(plan.kind === 'series' && plan.exdates).toEqual([d('2026-03-23T10:00:00Z')]);
  });

  test('an end before the start is rejected', () => {
    expect(() => planChange(single, { end: d('2026-03-16T08:00:00Z') }, 'all')).toThrow(ValidationError);
  });

  test('scope=this needs a real occurrence and only allows details and times', () => {
    expect(planChange(standup, { summary: 'x' }, 'this', d('2026-03-30T08:00:00Z'))).toEqual({
      kind: 'occurrence',
      recurrenceId: d('2026-03-30T08:00:00Z'),
    });
    expect(() => planChange(standup, { summary: 'x' }, 'this')).toThrow('recurrenceId is required');
    expect(() => planChange(standup, { summary: 'x' }, 'this', d('2026-03-24T09:00:00Z'))).toThrow('No occurrence');
    expect(() => planChange(standup, { calendarId: 'c' }, 'this', d('2026-03-30T08:00:00Z'))).toThrow('Only the title');
    expect(() => planChange(standup, { travelMinutes: 30 }, 'this', d('2026-03-30T08:00:00Z'))).toThrow(
      'Only the title',
    );
  });

  test('scope=following at the first occurrence changes the whole series', () => {
    expect(planChange(standup, { summary: 'x' }, 'following', standup.startAt).kind).toBe('series');
  });

  test('scope=following splits the series and carries the remaining COUNT over', () => {
    const rdates = [d('2026-03-18T09:00:00Z'), d('2026-04-01T08:00:00Z')];
    const plan = planChange(
      { ...standup, rdates },
      { start: d('2026-03-30T08:30:00Z') },
      'following',
      d('2026-03-30T08:00:00Z'),
    );
    if (plan.kind !== 'split') throw new Error(`expected a split, got ${plan.kind}`);
    expect(plan.start).toEqual(d('2026-03-30T08:30:00Z'));
    expect(plan.end).toEqual(d('2026-03-30T08:45:00Z'));
    expect(plan.shiftMs).toBe(1_800_000);
    expect(plan.rrule).toContain('COUNT=3');
    expect(plan.previousRrule).toContain('UNTIL=');
    expect(plan.previousExdates).toEqual([d('2026-03-23T09:00:00Z')]);
    expect(plan.exdates).toEqual([]);
    // RDATEs split the same way, and the later ones move with the new series.
    expect(plan.previousRdates).toEqual([d('2026-03-18T09:00:00Z')]);
    expect(plan.rdates).toEqual([d('2026-04-01T08:30:00Z')]);
  });
});

describe('overrideValues', () => {
  const at = d('2026-03-30T08:00:00Z');

  test('a new override starts at the occurrence and keeps the series length', () => {
    expect(overrideValues(standup, undefined, { summary: 'Moved' }, at)).toEqual({
      summary: 'Moved',
      description: null,
      location: null,
      startAt: at,
      endAt: d('2026-03-30T08:15:00Z'),
    });
  });

  test('a patch merges over an existing override, and null clears a detail', () => {
    const existing = {
      recurrenceId: at,
      startAt: d('2026-03-30T10:00:00Z'),
      endAt: d('2026-03-30T11:00:00Z'),
      summary: 'Kept',
      description: 'notes',
      location: 'Room 1',
    };
    expect(overrideValues(standup, existing, { location: null }, at)).toEqual({
      summary: 'Kept',
      description: 'notes',
      location: null,
      startAt: d('2026-03-30T10:00:00Z'),
      endAt: d('2026-03-30T11:00:00Z'),
    });
  });
});

describe('planDelete', () => {
  test('single events and scope=all delete the event', () => {
    expect(planDelete(single, 'this')).toEqual({ kind: 'event' });
    expect(planDelete(standup, 'all')).toEqual({ kind: 'event' });
  });

  test('scope=this cancels one occurrence', () => {
    const at = d('2026-03-30T08:00:00Z');
    expect(planDelete(standup, 'this', at)).toEqual({
      kind: 'occurrence',
      recurrenceId: at,
      exdates: [d('2026-03-23T09:00:00Z'), at],
    });
  });

  test('scope=following ends the series before the occurrence', () => {
    const plan = planDelete(standup, 'following', d('2026-04-06T08:00:00Z'));
    expect(plan.kind === 'following' && plan.rrule).toContain('UNTIL=');
  });
});
