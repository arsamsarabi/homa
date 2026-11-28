// Writes parsed iCalendar events into one calendar, matching by UID: shared by .ics import and
// subscription sync. Runs inside the caller's transaction and re-expands each event into the cache.
// Reminders come with the events, except on read-only calendars (subscriptions, calendars the
// account can't write), where the user's own reminders are local and a pull leaves them alone.
import { ICS_LIMITS, type IcsEvent, ValidationError } from '@homa/core';
import { type Executor, repo } from '@homa/db';
import { reexpand } from './instance-cache';

/** Inserts or (same UID in the calendar) replaces each event and its overrides. Returns the counts. */
export async function writeIcsEvents(
  tx: Executor,
  ownerUserId: string,
  calendarId: string,
  events: readonly IcsEvent[],
): Promise<{ imported: number; updated: number }> {
  const existing = await repo.findEventIdsByUid(
    tx,
    calendarId,
    events.map((e) => e.uid),
  );
  let imported = 0;
  let updated = 0;
  let occurrences = 0;
  const calendar = await repo.findOwnedCalendar(tx, ownerUserId, calendarId);
  const takeReminders = calendar ? !calendar.readOnly : false;
  for (const e of events) {
    const columns = {
      summary: e.summary,
      description: e.description,
      location: e.location,
      startAt: e.start,
      endAt: e.end,
      allDay: e.allDay,
      tz: e.tz,
      rrule: e.rrule,
      exdates: e.exdates,
      rdates: e.rdates,
      // Travel time comes from providers that carry it (their adaptor sets it, null included);
      // elsewhere it's Homa-only, so an update keeps it, unless the event became all-day.
      ...(e.allDay ? { travelMinutes: null } : e.travelMinutes !== undefined && { travelMinutes: e.travelMinutes }),
    };
    let id = existing.get(e.uid);
    if (id) {
      await repo.updateEventColumns(tx, id, columns);
      updated++;
    } else {
      id = (await repo.insertEvent(tx, { ownerUserId, calendarId, uid: e.uid, ...columns })).id;
      imported++;
    }
    await repo.replaceOverrides(tx, id, e.overrides);
    if (takeReminders) await repo.replaceEventReminders(tx, ownerUserId, id, e.reminders);
    occurrences += await reexpand(tx, id);
    // Rolls the whole write back: a file of endless rules shouldn't fill the cache.
    if (occurrences > ICS_LIMITS.maxOccurrences)
      throw new ValidationError(
        `The file has more than ${ICS_LIMITS.maxOccurrences} occurrences in the next 18 months`,
      );
  }
  return { imported, updated };
}
