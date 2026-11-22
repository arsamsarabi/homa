// Tasks, their projects and tags. See docs/design/phase-5-tasks.md. The columns keep a later CalDAV
// VTODO mapping possible: `uid` is the UID, `due_date` and `due_time` in `tz` are DUE (a DATE or a
// DATE-TIME), `rrule` is RRULE, `completed_at` gives STATUS and COMPLETED, `parent_id` RELATED-TO.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/** A group of tasks. Tasks without one are in the Inbox. */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('projects_owner_name_key').on(t.ownerUserId, sql`lower(${t.name})`)],
);

/** A per-user label on tasks; names are unique per user, ignoring case. */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_owner_name_key').on(t.ownerUserId, sql`lower(${t.name})`)],
);

/** A to-do. A subtask has a `parent_id` (one level deep) and its parent's project. */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The iCalendar UID, for a later VTODO mapping. */
    uid: text('uid').notNull().default(sql`gen_random_uuid()::text`),
    /** Deleting a project moves its tasks to the Inbox. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    /** 0 none, 1 low, 2 medium, 3 high. */
    priority: smallint('priority').notNull().default(0),
    dueDate: date('due_date', { mode: 'string' }),
    dueTime: time('due_time', { precision: 0 }),
    /** The zone the due time is in (and the one the task was made in). */
    tz: text('tz').notNull(),
    rrule: text('rrule'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('tasks_owner_uid_key').on(t.ownerUserId, t.uid),
    index('tasks_open_idx').on(t.ownerUserId).where(sql`${t.completedAt} is null`),
    index('tasks_completed_idx').on(t.ownerUserId, t.completedAt).where(sql`${t.completedAt} is not null`),
    index('tasks_parent_idx').on(t.parentId),
    index('tasks_project_idx').on(t.projectId),
    check('tasks_priority', sql`${t.priority} between 0 and 3`),
    check('tasks_due_time_needs_date', sql`${t.dueTime} is null or ${t.dueDate} is not null`),
    check('tasks_rrule_needs_date', sql`${t.rrule} is null or ${t.dueDate} is not null`),
  ],
);

export const taskTags = pgTable(
  'task_tags',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index('task_tags_tag_idx').on(t.tagId)],
);
