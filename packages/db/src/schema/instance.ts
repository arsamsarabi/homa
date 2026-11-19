// Instance-wide settings the admin manages: one row, created by the migration that adds the table.
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const instanceSettings = pgTable(
  'instance_settings',
  {
    // Always 1: the check keeps the table to a single row.
    id: integer('id').primaryKey().default(1),
    instanceName: text('instance_name').notNull().default('Homa'),
    // 'open' or 'closed'. The first account can always sign up.
    signUps: text('sign_ups').notNull().default('open'),
    // 'en' or 'fa': the language the web app uses until someone picks one.
    defaultLanguage: text('default_language').notNull().default('en'),
    // What new accounts start with; null home zone means "use the browser's zone".
    defaultHomeTz: text('default_home_tz'),
    defaultSecondaryCalendar: text('default_secondary_calendar').notNull().default('none'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('instance_settings_single_row', sql`${t.id} = 1`)],
);
