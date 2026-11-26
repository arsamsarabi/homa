// Request and response shapes for ICS import and the JSON data export.
import { ICS_LIMITS } from '@homa/core';
import { z } from '@hono/zod-openapi';
import { Calendar, Event } from '@/calendar';
import { Reminder } from '@/reminders';
import { Project, Tag, Task } from '@/tasks';

export const IcsBody = z.string().openapi({
  description: `An iCalendar (.ics) file, at most ${ICS_LIMITS.maxBytes / 1024 / 1024} MB and ${ICS_LIMITS.maxComponents} components`,
  example: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n…\r\nEND:VCALENDAR',
});

export const ImportSummary = z
  .object({
    imported: z.number().int().openapi({ description: 'New events' }),
    updated: z.number().int().openapi({ description: 'Events already in the calendar (same UID), replaced' }),
    skipped: z.number().int().openapi({ description: 'Events left out; the warnings say why' }),
    warnings: z.array(z.string()).openapi({ description: `At most ${ICS_LIMITS.maxWarnings}` }),
  })
  .openapi('ImportSummary');

export const EXPORT_VERSION = 1;

const ExportOverride = z.object({
  recurrenceId: z.iso.datetime(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
});

export const DataExport = z
  .object({
    version: z.literal(EXPORT_VERSION),
    exportedAt: z.iso.datetime(),
    settings: z.object({
      homeTz: z.string().nullable(),
      secondaryCalendar: z.string(),
      weekStart: z.number().int().min(0).max(6).nullable(),
      workWeekDays: z.array(z.number().int().min(0).max(6)).nullable(),
      defaultReminderMinutes: z.number().int().nullable(),
      sharingPreset: z.enum(['private', 'freebusy', 'read']),
    }),
    calendars: z.array(Calendar),
    events: z.array(Event.extend({ overrides: z.array(ExportOverride) })),
    reminders: z.array(Reminder),
    projects: z.array(Project),
    tags: z.array(Tag),
    tasks: z.array(Task),
  })
  .openapi('DataExport');
