// Reminders, the notifications they fire and their per-channel deliveries, and web push
// subscriptions. See docs/design/phase-4a-reminders.md.
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { events } from './calendar';

export const REMINDER_ACTIONS = ['display', 'email'] as const;
export type ReminderAction = (typeof REMINDER_ACTIONS)[number];

/**
 * An event reminder (`event_id` and `minutes_before`: every occurrence of the event) or a
 * standalone one (`title`, `starts_at` in `tz`, optionally repeating by `rrule`).
 */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    minutesBefore: integer('minutes_before'),
    /** Kept from the source (VALARM ACTION, Google method) so a round trip doesn't change it. */
    action: text('action', { enum: REMINDER_ACTIONS }).notNull().default('display'),
    title: text('title'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    tz: text('tz'),
    rrule: text('rrule'),
    /** Standalone only: when it fires next; null once it never will again. */
    nextFireAt: timestamp('next_fire_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('reminders_event_idx').on(t.eventId),
    index('reminders_owner_idx').on(t.ownerUserId),
    index('reminders_next_fire_idx').on(t.nextFireAt).where(sql`${t.nextFireAt} is not null`),
    check(
      'reminders_kind',
      sql`(${t.eventId} is not null and ${t.minutesBefore} is not null) or (${t.eventId} is null and ${t.title} is not null and ${t.startsAt} is not null and ${t.tz} is not null)`,
    ),
  ],
);

/** One fired reminder occurrence. The bell lists the open ones (not done, not snoozed ahead). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderId: uuid('reminder_id').references(() => reminders.id, { onDelete: 'set null' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    recurrenceId: timestamp('recurrence_id', { withTimezone: true }),
    title: text('title').notNull(),
    /** The occurrence's start (event reminders), or when the standalone reminder was due. */
    occurrenceStart: timestamp('occurrence_start', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
    /** One notification per occurrence and fire time, however many workers or restarts. */
    dedupeKey: text('dedupe_key').notNull().unique(),
    readAt: timestamp('read_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_owner_idx').on(t.ownerUserId, t.createdAt),
    index('notifications_snoozed_idx').on(t.snoozedUntil).where(sql`${t.snoozedUntil} is not null`),
  ],
);

export const DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** A notification's delivery on one channel, retried with backoff until sent or failed. */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    status: text('status', { enum: DELIVERY_STATUSES }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
  },
  (t) => [
    unique('notification_deliveries_key').on(t.notificationId, t.channel),
    index('notification_deliveries_due_idx').on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
  ],
);

/** A browser's web push subscription (one per endpoint). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_owner_idx').on(t.ownerUserId)],
);
