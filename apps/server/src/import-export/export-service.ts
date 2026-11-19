// Everything the user owns, for backup and moving to another Homa: settings, calendars, events and
// their overrides. Only the user's own rows.
import { NotFoundError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import { calendarOut, eventOut } from '@/calendar';
import { DataExport, EXPORT_VERSION } from './schemas';

export async function exportData(db: Db, userId: string, now = new Date()): Promise<z.infer<typeof DataExport>> {
  const [settings, calendars, events, overrides] = await Promise.all([
    repo.findSettings(db, userId),
    repo.listCalendars(db, userId),
    repo.listOwnerEvents(db, userId),
    repo.listOwnerOverrides(db, userId),
  ]);
  if (!settings) throw new NotFoundError();

  const byEvent = Map.groupBy(overrides, (o) => o.eventId);
  return DataExport.parse({
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    settings,
    calendars: calendars.map(calendarOut),
    events: events.map((e) => ({
      ...eventOut(e),
      overrides: (byEvent.get(e.id) ?? []).map((o) => ({
        recurrenceId: o.recurrenceId.toISOString(),
        start: o.startAt.toISOString(),
        end: o.endAt.toISOString(),
        summary: o.summary,
        description: o.description,
        location: o.location,
      })),
    })),
  });
}
