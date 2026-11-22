// Runtime schemas for reminders and notifications, as the API returns them.
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(['event', 'standalone', 'task']),
  title: z.string(),
  /** The occurrence's start, the task's due, or when a standalone reminder was due. */
  start: isoDateTime,
  allDay: z.boolean(),
  eventId: z.string().nullable(),
  taskId: z.string().nullable().default(null),
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

export const CHANNEL_KINDS = ['email', 'ntfy', 'gotify', 'webhook'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export const REMINDER_KINDS = ['event', 'standalone', 'task'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const ChannelSchema = z.object({
  id: z.string(),
  kind: z.enum(CHANNEL_KINDS),
  name: z.string(),
  enabled: z.boolean(),
  reminderKinds: z.array(z.enum(REMINDER_KINDS)),
  server: z.string().nullable(),
  topic: z.string().nullable(),
  host: z.string().nullable(),
  hasToken: z.boolean(),
  failing: z.boolean(),
  lastError: z.string().nullable(),
  lastErrorAt: isoDateTime.nullable(),
  lastSentAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  /** A webhook's signing secret: only right after it is created or rotated. */
  secret: z.string().optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;
export const ChannelListSchema = z.object({ items: z.array(ChannelSchema), email: z.boolean() });
export type ChannelList = z.infer<typeof ChannelListSchema>;
export const ChannelTestSchema = z.object({ ok: z.boolean(), error: z.string().optional() });
export type ChannelTest = z.infer<typeof ChannelTestSchema>;
