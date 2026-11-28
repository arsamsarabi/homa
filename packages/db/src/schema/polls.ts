// Group date-finding: polls, their candidate slots, participants and ranked answers, and the
// events a finalized poll made. See docs/design/phase-7-polls.md.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { calendars, events } from './calendar';

export const POLL_STATUSES = ['draft', 'open', 'closed', 'finalized', 'cancelled'] as const;
export const POLL_MODES = ['slots'] as const;
/** Poll notifications: opened, answers close tomorrow, answers are in, set, cancelled, renamed. */
export const POLL_NOTICES = ['opened', 'closing', 'closed', 'finalized', 'cancelled', 'renamed'] as const;

export const polls = pgTable(
  'polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizerUserId: text('organizer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    durationMinutes: integer('duration_minutes').notNull(),
    /** The organizer's zone when the poll was made, for emails. */
    tz: text('tz').notNull(),
    mode: text('mode', { enum: POLL_MODES }).notNull().default('slots'),
    status: text('status', { enum: POLL_STATUSES }).notNull().default('draft'),
    deadline: timestamp('deadline', { withTimezone: true }),
    /** People who must be able to come; null means everyone. */
    quorum: integer('quorum'),
    /** Hold every slot for the organizer while the poll is open. */
    holds: boolean('holds').notNull().default(false),
    /** Where the organizer's event goes when the poll is finalized. */
    calendarId: uuid('calendar_id').references(() => calendars.id, { onDelete: 'set null' }),
    finalSlotId: uuid('final_slot_id'),
    /** The deadline-tomorrow notice went out (so it goes once). */
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('polls_organizer_idx').on(t.organizerUserId),
    index('polls_open_deadline_idx').on(t.deadline).where(sql`${t.status} = 'open'`),
    check('polls_duration', sql`${t.durationMinutes} between 5 and 1440`),
    check('polls_quorum', sql`${t.quorum} is null or ${t.quorum} >= 1`),
  ],
);

export const pollSlots = pgTable(
  'poll_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('poll_slots_poll_start_key').on(t.pollId, t.startAt),
    check('poll_slots_order', sql`${t.endAt} > ${t.startAt}`),
  ],
);

export const pollParticipants = pgTable(
  'poll_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    required: boolean('required').notNull().default(false),
    /** Hold the slots this person ranked while the poll is open. */
    holds: boolean('holds').notNull().default(false),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    unique('poll_participants_poll_user_key').on(t.pollId, t.userId),
    index('poll_participants_user_idx').on(t.userId),
  ],
);

export const pollAnswers = pgTable(
  'poll_answers',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => pollParticipants.id, { onDelete: 'cascade' }),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => pollSlots.id, { onDelete: 'cascade' }),
    /** 1 is best; null means "can't make it". A missing row means unranked. */
    rank: integer('rank'),
  },
  (t) => [
    primaryKey({ columns: [t.participantId, t.slotId] }),
    check('poll_answers_rank', sql`${t.rank} is null or ${t.rank} >= 1`),
  ],
);

/** Events a finalized poll made: the organizer's and each participant's copy. Their time and place are the poll's. */
export const pollEvents = pgTable(
  'poll_events',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => events.id, { onDelete: 'cascade' }),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The organizer's event, whose title and description the copies follow. */
    organizer: boolean('organizer').notNull().default(false),
  },
  (t) => [index('poll_events_poll_idx').on(t.pollId)],
);
