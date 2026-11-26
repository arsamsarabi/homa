// People on one instance: invites to it, and each user's circles. See docs/design/phase-6-sharing.md.
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** An invite link. The token itself is never stored, only its SHA-256 (hex). */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    /** Only this address can use the invite; null for anyone with the link. */
    email: text('email'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Homa emailed the link to `email`, so using it proves the address. */
    emailed: boolean('emailed').notNull().default(false),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invites_created_by_idx').on(t.createdBy)],
);

/** A named group of people, private to its owner, used for sharing. */
export const circles = pgTable(
  'circles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Display colour (`#rrggbb`). */
    color: text('color').notNull().default('#7d7fa3'),
    /**
     * Seed for a deterministic GitHub-style identicon. Prefer this over hosting blobs: the client
     * builds an SVG data URL from the seed; `avatarImage` overrides when the user uploads a picture.
     */
    avatarSeed: text('avatar_seed').notNull(),
    /** Optional uploaded image as a small `data:image/...;base64,...` URL. Null → use `avatarSeed`. */
    avatarImage: text('avatar_image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('circles_owner_name_key').on(t.ownerUserId, sql`lower(${t.name})`)],
);

export const circleMembers = pgTable(
  'circle_members',
  {
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.circleId, t.userId] }), index('circle_members_user_idx').on(t.userId)],
);
