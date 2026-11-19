// Runtime schemas for connected calendars (ICS subscriptions) and the holiday catalog.
import { z } from 'zod';
import { CalendarSchema } from '@/schemas/calendar';

export const CONNECTION_STATUSES = ['pending', 'syncing', 'ok', 'error'] as const;

export const ConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(['ics', 'caldav', 'google', 'microsoft']),
  status: z.enum(CONNECTION_STATUSES),
  lastError: z.string().nullable(),
  lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
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
