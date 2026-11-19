// The outbox for two-way sync. See docs/product/architecture.md ("Sync").
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { calendars } from './calendar';
import { connections } from './connections';

export const OUTBOX_KINDS = ['put', 'delete'] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

/**
 * Local changes waiting to go to a two-way calendar (CalDAV), one row per remote resource: a later
 * change to the same event replaces the pending one (and bumps `version`), so the worker only
 * finishes an op whose version it pushed. Written in the same transaction as the local change.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    uid: text('uid').notNull(),
    kind: text('kind', { enum: OUTBOX_KINDS }).notNull(),
    /** put: the event to upload (its current state is read when pushing). */
    eventId: uuid('event_id'),
    /** delete: the resource and the ETag it had when the event was deleted. */
    href: text('href'),
    etag: text('etag'),
    version: integer('version').notNull().default(1),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('outbox_calendar_uid_key').on(t.calendarId, t.uid),
    index('outbox_due_idx').on(t.connectionId, t.nextAttemptAt),
  ],
);
