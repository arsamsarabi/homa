// Request and response schemas for standalone reminders, notifications and web push.
import { isTimeZone, parseRrule, REMINDER_LIMITS } from '@homa/core';
import { z } from '@hono/zod-openapi';

const When = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
export const Tz = z
  .string()
  .refine(isTimeZone, 'an IANA time zone like Europe/London')
  .openapi({ example: 'Europe/London' });

const REPEATS = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
const isRepeat = (v: string): boolean => {
  try {
    return REPEATS.has(String(parseRrule(v).freq));
  } catch {
    return false; // not a usable RRULE; the refine below reports it
  }
};
export const Repeat = z
  .string()
  .max(500)
  .refine(isRepeat, 'an RRULE repeating daily, weekly, monthly or yearly, like FREQ=WEEKLY;BYDAY=MO')
  .transform((v) => v.replace(/^RRULE:/i, ''))
  .openapi({ example: 'FREQ=WEEKLY;BYDAY=MO' });

export const Reminder = z
  .object({
    id: z.uuid(),
    title: z.string(),
    at: z.iso.datetime().openapi({ description: 'The first (or only) time it fires' }),
    tz: z.string(),
    rrule: z.string().nullable(),
    nextFireAt: z.iso.datetime().nullable().openapi({ description: 'Null once it will not fire again' }),
    createdAt: z.iso.datetime(),
  })
  .openapi('Reminder');

const ReminderFields = z.object({
  title: z.string().trim().min(1).max(REMINDER_LIMITS.title),
  at: When,
  tz: Tz,
  rrule: Repeat.nullable(),
});
export const ReminderInput = ReminderFields.extend({ rrule: Repeat.nullable().optional() }).openapi('ReminderInput');
export const ReminderPatch = ReminderFields.partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to change')
  .openapi('ReminderPatch');

export const Notification = z
  .object({
    id: z.uuid(),
    kind: z.enum(['event', 'standalone', 'task', 'poll']),
    title: z.string(),
    start: z.iso
      .datetime()
      .openapi({ description: "The occurrence's start, the task's due, or when the standalone reminder was due" }),
    allDay: z.boolean(),
    eventId: z.uuid().nullable(),
    taskId: z.uuid().nullable(),
    pollId: z.uuid().nullable(),
    recurrenceId: z.iso.datetime().nullable(),
    fireAt: z.iso.datetime(),
    read: z.boolean(),
  })
  .openapi('Notification');
export const NotificationList = z.object({ items: z.array(Notification), unread: z.int() }).openapi('NotificationList');

const MAX_SNOOZE_MIN = 30 * 1440;
export const SnoozeInput = z
  .object({
    minutes: z.int().min(1).max(MAX_SNOOZE_MIN).optional(),
    until: When.optional(),
  })
  .refine((v) => (v.minutes === undefined) !== (v.until === undefined), 'give minutes or until, not both')
  .openapi('SnoozeInput');

export const PushKey = z
  .object({
    publicKey: z
      .string()
      .openapi({ description: "The VAPID public key (base64url) for PushManager.subscribe's applicationServerKey" }),
  })
  .openapi('PushKey');
export const PushSubscriptionInput = z
  .object({
    endpoint: z.url().max(2000),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  })
  .openapi('PushSubscriptionInput');
export const PushUnsubscribe = z.object({ endpoint: z.url().max(2000) }).openapi('PushUnsubscribe');

export const Id = z.object({ id: z.uuid() });
