// Runtime schemas for reminders and notifications, as the API returns them.
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(['event', 'standalone']),
  title: z.string(),
  /** The occurrence's start, or when a standalone reminder was due. */
  start: isoDateTime,
  allDay: z.boolean(),
  eventId: z.string().nullable(),
  recurrenceId: isoDateTime.nullable(),
  fireAt: isoDateTime,
  read: z.boolean(),
});
export type Notification = z.infer<typeof NotificationSchema>;
export const NotificationListSchema = z.object({ items: z.array(NotificationSchema), unread: z.number().int() });
export type NotificationList = z.infer<typeof NotificationListSchema>;

export const ReminderSchema = z.object({
  id: z.string(),
  title: z.string(),
  at: isoDateTime,
  tz: z.string(),
  rrule: z.string().nullable(),
  nextFireAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Reminder = z.infer<typeof ReminderSchema>;
export const ReminderListSchema = z.array(ReminderSchema);
