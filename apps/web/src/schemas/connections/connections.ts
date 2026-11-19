// Runtime schemas for connected calendars (ICS subscriptions, CalDAV accounts) and the holiday catalog.
import { z } from 'zod';
import { CalendarSchema } from '@/schemas/calendar';

export const CONNECTION_STATUSES = ['pending', 'syncing', 'ok', 'error'] as const;

export const ConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(['ics', 'caldav', 'google', 'microsoft']),
  label: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  lastError: z.string().nullable(),
  lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
  notice: z.string().nullable(),
  noticeAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  calendars: z.array(CalendarSchema),
});
export type Connection = z.infer<typeof ConnectionSchema>;
export const ConnectionListSchema = z.array(ConnectionSchema);

export const HolidayFeedSchema = z.object({
  id: z.string(),
  country: z.string(),
  names: z.object({ en: z.string(), fa: z.string() }),
  source: z.string(),
});
export type HolidayFeed = z.infer<typeof HolidayFeedSchema>;
export const HolidayFeedListSchema = z.array(HolidayFeedSchema);

/** A calendar on a CalDAV account, and whether it syncs. */
export const RemoteCalendarSchema = z.object({
  remoteId: z.string(),
  name: z.string().nullable(),
  color: z.string().nullable(),
  readOnly: z.boolean(),
  selected: z.boolean(),
});
export type RemoteCalendar = z.infer<typeof RemoteCalendarSchema>;
export const RemoteCalendarListSchema = z.array(RemoteCalendarSchema);
