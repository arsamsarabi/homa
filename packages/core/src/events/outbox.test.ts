import { describe, expect, test } from 'bun:test';
import { planChange, planDelete } from './changes';
import { opsForChange, opsForCreate, opsForDelete, type SyncedEvent } from './outbox';

const d = (s: string): Date => new Date(s);
const series = {
  startAt: d('2027-03-01T09:00:00Z'),
  endAt: d('2027-03-01T10:00:00Z'),
  tz: 'UTC',
  rrule: 'FREQ=WEEKLY',
  exdates: [],
  rdates: [],
};
const synced: SyncedEvent = {
  id: 'e1',
  calendarId: 'c1',
  uid: 'u1',
  remoteHref: 'https://dav/c1/u1.ics',
  remoteEtag: '"1"',
};
const third = d('2027-03-15T09:00:00Z');

describe('outbox ops', () => {
  test('a create uploads the new event', () => {
    expect(opsForCreate({ id: 'e1', calendarId: 'c1', uid: 'u1' })).toEqual([
      { kind: 'put', calendarId: 'c1', eventId: 'e1', uid: 'u1' },
    ]);
  });

  test('"all" and "this" edits upload the whole event again', () => {
    for (const plan of [
      planChange(series, { summary: 'x' }, 'all'),
      planChange(series, { summary: 'x' }, 'this', third),
      planChange(series, { summary: 'x' }, 'following', series.startAt), // from the first: the whole series
    ])
      expect(opsForChange(synced, plan, { calendarId: 'c1' })).toEqual([
        { kind: 'put', calendarId: 'c1', eventId: 'e1', uid: 'u1' },
      ]);
  });

  test('"this and following" uploads the shortened series and creates the new one', () => {
    const plan = planChange(series, { summary: 'x' }, 'following', third);
    expect(plan.kind).toBe('split');
    expect(opsForChange(synced, plan, { calendarId: 'c1', created: { id: 'e2', uid: 'u2' } })).toEqual([
      { kind: 'put', calendarId: 'c1', eventId: 'e1', uid: 'u1' },
      { kind: 'put', calendarId: 'c1', eventId: 'e2', uid: 'u2' },
    ]);
    expect(() => opsForChange(synced, plan, { calendarId: 'c1' })).toThrow();
  });

  test('moving to another calendar deletes the old resource with its last ETag and creates a new one', () => {
    const plan = planChange(series, { calendarId: 'c2' }, 'all');
    expect(opsForChange(synced, plan, { calendarId: 'c2' })).toEqual([
      { kind: 'delete', calendarId: 'c1', uid: 'u1', href: 'https://dav/c1/u1.ics', etag: '"1"' },
      { kind: 'put', calendarId: 'c2', eventId: 'e1', uid: 'u1' },
    ]);
  });

  test('deleting the whole event deletes the resource; one or following occurrences upload the event', () => {
    expect(opsForDelete(synced, planDelete(series, 'all'))).toEqual([
      { kind: 'delete', calendarId: 'c1', uid: 'u1', href: 'https://dav/c1/u1.ics', etag: '"1"' },
    ]);
    for (const scope of ['this', 'following'] as const)
      expect(opsForDelete(synced, planDelete(series, scope, third))).toEqual([
        { kind: 'put', calendarId: 'c1', eventId: 'e1', uid: 'u1' },
      ]);
  });
});
