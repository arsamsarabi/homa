// Imports an .ics file into one of the user's calendars. The file is parsed by @homa/core before the
// transaction; then, in one transaction, each event is inserted or (same UID in that calendar)
// replaced with its overrides, and re-expanded into the instance cache.
import { ICS_LIMITS, NotFoundError, parseIcs, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import { reexpand } from '@/calendar';
import type { ImportSummary } from './schemas';

export async function importIcs(
  db: Db,
  userId: string,
  calendarId: string,
  text: string,
): Promise<z.infer<typeof ImportSummary>> {
  if (!(await repo.calendarIsOwned(db, userId, calendarId))) throw new NotFoundError();
  const settings = await repo.findSettings(db, userId);
  const parsed = parseIcs(text, { floatingTz: settings?.homeTz ?? 'UTC' });

  return db.transaction(async (tx) => {
    const existing = await repo.findEventIdsByUid(
      tx,
      calendarId,
      parsed.events.map((e) => e.uid),
    );
    let imported = 0;
    let updated = 0;
    let occurrences = 0;
    for (const e of parsed.events) {
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
      };
      let id = existing.get(e.uid);
      if (id) {
        await repo.updateEventColumns(tx, id, columns);
        updated++;
      } else {
        id = (await repo.insertEvent(tx, { ownerUserId: userId, calendarId, uid: e.uid, ...columns })).id;
        imported++;
      }
      await repo.replaceOverrides(tx, id, e.overrides);
      occurrences += await reexpand(tx, id);
      // Rolls the whole import back: a file of endless rules shouldn't fill the cache.
      if (occurrences > ICS_LIMITS.maxOccurrences)
        throw new ValidationError(
          `The file has more than ${ICS_LIMITS.maxOccurrences} occurrences in the next 18 months`,
        );
    }
    return { imported, updated, skipped: parsed.skipped, warnings: parsed.warnings };
  });
}
