// Calendar grants and a viewer's prefs for calendars shared with them. See docs/design/phase-6-sharing.md.
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { calendars } from './calendar';
import { circles } from './people';

export const GRANT_LEVELS = ['none', 'freebusy', 'read', 'edit'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

export const CALENDAR_DEFAULTS = ['none', 'freebusy', 'read'] as const;
export type CalendarDefault = (typeof CALENDAR_DEFAULTS)[number];

export const SHARING_PRESETS = ['private', 'freebusy', 'read'] as const;
export type SharingPreset = (typeof SHARING_PRESETS)[number];

/**
 * A grant of a calendar to one person or one circle. Exactly one of `granteeUserId` /
 * `circleId` is set. The circle must belong to the calendar's owner (enforced in the service).
 */
export const calendarGrants = pgTable(
  'calendar_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    granteeUserId: text('grantee_user_id').references(() => users.id, { onDelete: 'cascade' }),
    circleId: uuid('circle_id').references(() => circles.id, { onDelete: 'cascade' }),
    level: text('level', { enum: GRANT_LEVELS }).notNull(),
  },
  (t) => [
    check(
      'calendar_grants_one_target',
      sql`(${t.granteeUserId} is not null and ${t.circleId} is null) or (${t.granteeUserId} is null and ${t.circleId} is not null)`,
    ),
    check('calendar_grants_level', sql`${t.level} in ('none', 'freebusy', 'read', 'edit')`),
    uniqueIndex('calendar_grants_person_key')
      .on(t.calendarId, t.granteeUserId)
      .where(sql`${t.granteeUserId} is not null`),
    uniqueIndex('calendar_grants_circle_key').on(t.calendarId, t.circleId).where(sql`${t.circleId} is not null`),
    index('calendar_grants_calendar_idx').on(t.calendarId),
    index('calendar_grants_grantee_idx').on(t.granteeUserId),
    index('calendar_grants_circle_idx').on(t.circleId),
  ],
);

/**
 * A viewer's own choice for a shared calendar (hide from views). Missing row means shown.
 * Own calendars use `calendars.hidden` instead.
 */
export const sharedCalendarPrefs = pgTable(
  'shared_calendar_prefs',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    hidden: boolean('hidden').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.calendarId] })],
);
