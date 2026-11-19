// Runtime schemas for the calendar API's responses. The views rely on these shapes, so responses
// are parsed, not just cast: a server/client mismatch fails loudly at the fetch.
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const CalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Calendar = z.infer<typeof CalendarSchema>;
export const CalendarListSchema = z.array(CalendarSchema);

export const OccurrenceSchema = z.object({
  eventId: z.string(),
  calendarId: z.string(),
  recurrenceId: isoDateTime,
  start: isoDateTime,
  end: isoDateTime,
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  allDay: z.boolean(),
  tz: z.string(),
  recurring: z.boolean(),
  overridden: z.boolean(),
});
export type Occurrence = z.infer<typeof OccurrenceSchema>;
export const OccurrenceListSchema = z.array(OccurrenceSchema);

export const EventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  uid: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  start: isoDateTime,
  end: isoDateTime,
  allDay: z.boolean(),
  tz: z.string(),
  rrule: z.string().nullable(),
  exdates: z.array(isoDateTime),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type HomaEvent = z.infer<typeof EventSchema>;

export const SCOPES = ['this', 'following', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

/** What an .ics import did. */
export const ImportSummarySchema = z.object({
  imported: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  warnings: z.array(z.string()),
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;
