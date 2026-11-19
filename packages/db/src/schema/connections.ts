// External calendar connections (ICS subscriptions now; CalDAV, Google and Microsoft later).
// See docs/product/architecture.md ("Sync").
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const CONNECTION_PROVIDERS = ['ics', 'caldav', 'google', 'microsoft'] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];
export const CONNECTION_STATUSES = ['pending', 'syncing', 'ok', 'error'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: CONNECTION_PROVIDERS }).notNull(),
    /**
     * AES-256-GCM ciphertext of the provider's secrets as JSON (the feed URL for ICS, which can hold
     * a private token; OAuth tokens or an app password later), bound to this row's id.
     */
    credentials: text('credentials').notNull(),
    status: text('status', { enum: CONNECTION_STATUSES }).notNull().default('pending'),
    /** Why the last sync failed, in words safe to show the user (never the URL or a token). */
    lastError: text('last_error'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    /** When the running sync claimed the row; a stale claim (a crashed worker) can be taken over. */
    syncStartedAt: timestamp('sync_started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('connections_owner_idx').on(t.ownerUserId), index('connections_synced_idx').on(t.lastSyncedAt)],
);
