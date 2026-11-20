// Calendars and events. Times are timestamptz (UTC) plus the IANA zone they were authored in;
// see docs/product/architecture.md ("Domain model" and "Recurrence and the expansion cache").
import { sql } from 'drizzle-orm';
import { boolean, customType, index, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { connections } from './connections';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Postgres tstzrange as its text form, e.g. `["2026-03-16 09:00:00+00","2026-03-16 09:15:00+00")`. */
const tstzrange = customType<{ data: string }>({ dataType: () => 'tstzrange' });

export const calendars = pgTable(
  'calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#7d7fa3'),
    /** The connection this calendar syncs with; null for a native calendar. */
    connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
    /** Events can't be created, changed or deleted here (ICS subscriptions). */
    readOnly: boolean('read_only').notNull().default(false),
    /** Left out of the calendar views (the user's filter); its events still sync. */
    hidden: boolean('hidden').notNull().default(false),
    /** The provider's id for this calendar (a CalDAV href, a Google calendar id); null for native and ICS. */
    remoteId: text('remote_id'),
    /** Incremental sync cursor: a Google syncToken, Graph delta link or CalDAV sync-token / ctag. */
    syncToken: text('sync_token'),
    /** ICS conditional GET: the feed's last ETag and Last-Modified, and a hash of its body. */
    remoteEtag: text('remote_etag'),
    remoteLastModified: text('remote_last_modified'),
    contentHash: text('content_hash'),
    ...timestamps,
  },
  (t) => [index('calendars_owner_idx').on(t.ownerUserId), index('calendars_connection_idx').on(t.connectionId)],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** iCalendar UID, kept stable for export and sync; an import matches events by it. */
    uid: text('uid').notNull(),
    summary: text('summary').notNull().default(''),
    description: text('description'),
    location: text('location'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    tz: text('tz').notNull(),
    /** RRULE value without the "RRULE:" prefix; null for a single event. */
    rrule: text('rrule'),
    exdates: timestamp('exdates', { withTimezone: true }).array().notNull().default(sql`'{}'`),
    /** Extra occurrence starts (RDATE) beside the RRULE's. */
    rdates: timestamp('rdates', { withTimezone: true }).array().notNull().default(sql`'{}'`),
    source: text('source').notNull().default('native'),
    /** CalDAV: the URL of the remote resource holding this event, and its ETag when last seen. */
    remoteHref: text('remote_href'),
    remoteEtag: text('remote_etag'),
    /** How far ahead event_instances holds this event's occurrences; null for single events. */
    expandedUntil: timestamp('expanded_until', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Unique per calendar, as in CalDAV: importing a file twice into one calendar updates its events.
    unique('events_calendar_uid_key').on(t.calendarId, t.uid),
    index('events_calendar_idx').on(t.calendarId),
    index('events_remote_href_idx').on(t.calendarId, t.remoteHref).where(sql`${t.remoteHref} is not null`),
    index('events_recurring_idx').on(t.expandedUntil).where(sql`${t.rrule} is not null`),
  ],
);

/** A changed occurrence of a recurring event. Null text fields inherit from the series. */
export const eventOverrides = pgTable(
  'event_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    recurrenceId: timestamp('recurrence_id', { withTimezone: true }).notNull(),
    summary: text('summary'),
    description: text('description'),
    location: text('location'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [unique('event_overrides_event_recurrence_key').on(t.eventId, t.recurrenceId)],
);

/** Expansion cache: one row per occurrence up to the event's expanded_until. Rebuilt on every write. */
export const eventInstances = pgTable(
  'event_instances',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id').notNull(),
    calendarId: uuid('calendar_id').notNull(),
    recurrenceId: timestamp('recurrence_id', { withTimezone: true }).notNull(),
    during: tstzrange('during').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.recurrenceId] }),
    index('event_instances_during_idx').using('gist', t.during),
    index('event_instances_owner_idx').on(t.ownerUserId),
  ],
);
