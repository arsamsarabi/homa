// Imports an .ics file into one of the user's calendars. The file is parsed by @homa/core before the
// transaction; then, in one transaction, each event is inserted or (same UID in that calendar)
// replaced with its overrides, and re-expanded into the instance cache.
import { assertWritable, NotFoundError, parseIcs } from '@homa/core';
import { type Db, repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import { writeIcsEvents } from '@/calendar';
import type { ImportSummary } from './schemas';

export async function importIcs(
  db: Db,
  userId: string,
  calendarId: string,
  text: string,
): Promise<z.infer<typeof ImportSummary>> {
  const calendar = await repo.findOwnedCalendar(db, userId, calendarId);
  if (!calendar) throw new NotFoundError();
  assertWritable(calendar);
  const settings = await repo.findSettings(db, userId);
  const parsed = parseIcs(text, { floatingTz: settings?.homeTz ?? 'UTC' });

  return db.transaction(async (tx) => {
    const counts = await writeIcsEvents(tx, userId, calendarId, parsed.events);
    return { ...counts, skipped: parsed.skipped, warnings: parsed.warnings };
  });
}
