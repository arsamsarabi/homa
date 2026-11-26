// Permission-aware free/busy for a set of people (phase 6c). Reuses the occurrence reader so
// availability matches the views; all-day events never count (decision 16).
import { type Interval, mergeBusy, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { accessibleCalendars } from './access';
import { listOccurrences } from './occurrences-service';

export type BusyOut = { start: Date; end: Date };
export type PersonAvailabilityOut = { userId: string; shared: boolean; busy: BusyOut[] };
export type AvailabilityOut = { from: Date; to: Date; people: PersonAvailabilityOut[] };

/** Unique ids in first-seen order. */
function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Busy intervals for each person in `userIds`, as far as `callerId` is allowed to know.
 * Unknown ids are a 400. The caller’s own calendars all count (hidden ones too); for anyone
 * else only calendars at freebusy+ count, and `shared: false` when none do.
 */
export async function getAvailability(
  db: Db,
  callerId: string,
  input: { from: Date; to: Date; userIds: readonly string[] },
): Promise<AvailabilityOut> {
  const userIds = uniqueIds(input.userIds);
  const found = await repo.existingUserIds(db, userIds);
  if (userIds.some((id) => !found.has(id))) throw new ValidationError('Unknown person');

  const [own, access] = await Promise.all([repo.listCalendars(db, callerId), accessibleCalendars(db, callerId)]);

  const calendarsByUser = new Map<string, string[]>();
  const ownerByCalendar = new Map<string, string>();
  for (const c of own) ownerByCalendar.set(c.id, callerId);
  for (const a of access) ownerByCalendar.set(a.calendar.id, a.owner.id);

  for (const id of userIds) {
    if (id === callerId) {
      calendarsByUser.set(
        id,
        own.map((c) => c.id),
      );
    } else {
      calendarsByUser.set(
        id,
        access.filter((a) => a.owner.id === id).map((a) => a.calendar.id),
      );
    }
  }

  const calendarIds = [...new Set([...calendarsByUser.values()].flat())];
  const occs = calendarIds.length ? await listOccurrences(db, callerId, input.from, input.to, calendarIds) : [];

  const rawBusy = new Map<string, Interval[]>();
  for (const id of userIds) rawBusy.set(id, []);
  for (const o of occs) {
    if (o.event.allDay) continue;
    const owner = ownerByCalendar.get(o.event.calendarId);
    if (!owner) continue;
    const bucket = rawBusy.get(owner);
    if (!bucket) continue;
    bucket.push({ start: o.start, end: o.end });
  }

  const people: PersonAvailabilityOut[] = userIds.map((userId) => {
    const calIds = calendarsByUser.get(userId) ?? [];
    const shared = userId === callerId || calIds.length > 0;
    const busy = shared ? mergeBusy(rawBusy.get(userId) ?? [], input.from, input.to) : [];
    return { userId, shared, busy };
  });

  return { from: input.from, to: input.to, people };
}
