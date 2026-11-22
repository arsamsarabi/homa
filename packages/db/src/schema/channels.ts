// Notification channels a user adds beside the bell and web push: email, ntfy, Gotify and webhooks.
// See docs/design/phase-4b-channels.md.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const CHANNEL_KINDS = ['email', 'ntfy', 'gotify', 'webhook'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export const REMINDER_KINDS = ['event', 'standalone', 'task'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const notificationChannels = pgTable(
  'notification_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CHANNEL_KINDS }).notNull(),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Which notifications it gets: event, standalone and task reminders. */
    reminderKinds: text('reminder_kinds', { enum: REMINDER_KINDS })
      .array()
      .notNull()
      .default(sql`'{event,standalone,task}'::text[]`),
    /** Encrypted (HOMA_ENCRYPTION_KEY) server, topic, URL and tokens; null for email. */
    config: text('config'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('notification_channels_owner_idx').on(t.ownerUserId)],
);
