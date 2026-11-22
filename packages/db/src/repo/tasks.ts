// Tasks and their tags, always filtered by owner. Tag names come back on each task, sorted.
import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { events, tags, tasks, taskTags } from '../schema';

export type TaskRow = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
/** A task with its tag names and its time block's event (start, end, calendar), if any. */
export type TaskWithTags = TaskRow & {
  tags: string[];
  blockStart: Date | null;
  blockEnd: Date | null;
  blockCalendarId: string | null;
};
export type TaskPatch = Partial<Omit<NewTask, 'id' | 'ownerUserId' | 'uid' | 'createdAt' | 'updatedAt'>>;

// Spelled out: Drizzle leaves column names unqualified in a one-table select, which is ambiguous here.
const tagNames: SQL<string[]> = sql<
  string[]
>`coalesce((select array_agg(tg.name order by lower(tg.name)) from task_tags tt join tags tg on tg.id = tt.tag_id where tt.task_id = "tasks"."id"), '{}')`;
const withTags: ReturnType<typeof getTableColumns<typeof tasks>> & {
  tags: SQL<string[]>;
  blockStart: typeof events.startAt;
  blockEnd: typeof events.endAt;
  blockCalendarId: typeof events.calendarId;
} = {
  ...getTableColumns(tasks),
  tags: tagNames,
  blockStart: events.startAt,
  blockEnd: events.endAt,
  blockCalendarId: events.calendarId,
};
const block: SQL = eq(events.id, tasks.scheduledEventId);
const owned = (ownerUserId: string, id: string): SQL | undefined =>
  and(eq(tasks.id, id), eq(tasks.ownerUserId, ownerUserId));

/** Every open task (subtasks too): due first (soonest), then by priority and age. */
export const listOpenTasks = (db: Executor, ownerUserId: string): Promise<TaskWithTags[]> =>
  db
    .select(withTags)
    .from(tasks)
    .leftJoin(events, block)
    .where(and(eq(tasks.ownerUserId, ownerUserId), isNull(tasks.completedAt)))
    .orderBy(
      sql`${tasks.dueDate} asc nulls last`,
      sql`${tasks.dueTime} asc nulls first`,
      desc(tasks.priority),
      asc(tasks.createdAt),
    );

/** The most recently completed tasks. */
export const listCompletedTasks = (db: Executor, ownerUserId: string, limit: number): Promise<TaskWithTags[]> =>
  db
    .select(withTags)
    .from(tasks)
    .leftJoin(events, block)
    .where(and(eq(tasks.ownerUserId, ownerUserId), sql`${tasks.completedAt} is not null`))
    .orderBy(desc(tasks.completedAt))
    .limit(limit);

/** Every task the owner has, for the JSON export. */
export const listOwnerTasks = (db: Executor, ownerUserId: string): Promise<TaskWithTags[]> =>
  db
    .select(withTags)
    .from(tasks)
    .leftJoin(events, block)
    .where(eq(tasks.ownerUserId, ownerUserId))
    .orderBy(asc(tasks.createdAt));

export async function findOwnedTask(db: Executor, ownerUserId: string, id: string): Promise<TaskWithTags | undefined> {
  const [row] = await db.select(withTags).from(tasks).leftJoin(events, block).where(owned(ownerUserId, id));
  return row;
}

export async function countOpenTasks(db: Executor, ownerUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.ownerUserId, ownerUserId), isNull(tasks.completedAt)));
  return row?.n ?? 0;
}

export async function hasSubtasks(db: Executor, id: string): Promise<boolean> {
  const [row] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentId, id)).limit(1);
  return row !== undefined;
}

export async function insertTask(db: Executor, values: NewTask): Promise<TaskRow> {
  const [row] = await db.insert(tasks).values(values).returning();
  if (!row) throw new Error('insert into tasks returned no row');
  return row;
}

/** Returns the updated row, or undefined if it isn't the owner's. Callers don't pass an empty patch. */
export async function updateOwnedTask(
  db: Executor,
  ownerUserId: string,
  id: string,
  patch: TaskPatch,
): Promise<TaskRow | undefined> {
  const [row] = await db.update(tasks).set(patch).where(owned(ownerUserId, id)).returning();
  return row;
}

/** True if a row was deleted (its subtasks go with it). */
export async function deleteOwnedTask(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db.delete(tasks).where(owned(ownerUserId, id)).returning({ id: tasks.id });
  return rows.length > 0;
}

/** Completes a task's open subtasks. */
export async function completeSubtasks(db: Executor, parentId: string, at: Date): Promise<void> {
  await db
    .update(tasks)
    .set({ completedAt: at })
    .where(and(eq(tasks.parentId, parentId), isNull(tasks.completedAt)));
}

/** Moves a task's subtasks to its project. */
export async function setSubtasksProject(db: Executor, parentId: string, projectId: string | null): Promise<void> {
  await db.update(tasks).set({ projectId }).where(eq(tasks.parentId, parentId));
}

/** Sets a task's tags by name, creating the owner's tags that don't exist yet (matched ignoring case). */
export async function replaceTaskTags(
  db: Executor,
  ownerUserId: string,
  taskId: string,
  names: readonly string[],
): Promise<void> {
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
  if (!names.length) return;
  await db
    .insert(tags)
    .values(names.map((name) => ({ ownerUserId, name })))
    .onConflictDoNothing();
  const ids = await db
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.ownerUserId, ownerUserId),
        inArray(
          sql`lower(${tags.name})`,
          names.map((n) => n.toLowerCase()),
        ),
      ),
    );
  if (ids.length) await db.insert(taskTags).values(ids.map(({ id }) => ({ taskId, tagId: id })));
}

/** Reopens a task's completed subtasks (a repeating task coming round again). */
export async function reopenSubtasks(db: Executor, parentId: string): Promise<void> {
  await db
    .update(tasks)
    .set({ completedAt: null })
    .where(and(eq(tasks.parentId, parentId), sql`${tasks.completedAt} is not null`));
}

/** The tasks whose time block is one of these events, by event id. */
export async function tasksByBlock(
  db: Executor,
  eventIds: readonly string[],
): Promise<Map<string, { id: string; done: boolean }>> {
  if (!eventIds.length) return new Map();
  const rows = await db
    .select({ id: tasks.id, eventId: tasks.scheduledEventId, completedAt: tasks.completedAt })
    .from(tasks)
    .where(inArray(tasks.scheduledEventId, [...eventIds]));
  return new Map(rows.flatMap((r) => (r.eventId ? [[r.eventId, { id: r.id, done: r.completedAt !== null }]] : [])));
}
