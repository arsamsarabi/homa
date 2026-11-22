// Tasks for one user: create, change, complete (a repeating task moves to its next due instead),
// reopen and delete, their reminders, and their time blocks on the calendar. A subtask is one
// level deep and always in its parent's project.
import { NotFoundError, nextDue, TASK_LIMITS, ValidationError, wallOf } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { createEvent, deleteEvent, updateEvent } from '@/calendar/events-service';
import type { TaskOut } from './responses';
import { syncTaskReminders } from './task-reminders';

export type TaskFields = {
  title: string;
  notes: string | null;
  projectId: string | null;
  parentId: string | null;
  tags: string[];
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  tz: string;
  rrule: string | null;
  reminders: number[];
};

const EMPTY: Omit<TaskFields, 'title' | 'tz'> = {
  notes: null,
  projectId: null,
  parentId: null,
  tags: [],
  priority: 0,
  dueDate: null,
  dueTime: null,
  rrule: null,
  reminders: [],
};

/** Names without duplicates (ignoring case), the first spelling kept. */
const uniqueNames = (names: readonly string[]): string[] =>
  names.filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);

const checkDue = (f: Pick<TaskFields, 'dueDate' | 'dueTime' | 'rrule'>): void => {
  if (f.dueTime && !f.dueDate) throw new ValidationError('A due time needs a due date');
  if (f.rrule && !f.dueDate) throw new ValidationError('A repeating task needs a due date');
};

/** The project the task ends up in: its parent's for a subtask, else the one asked for (checked). */
async function placement(
  tx: Executor,
  userId: string,
  f: Pick<TaskFields, 'projectId' | 'parentId'>,
  selfId?: string,
): Promise<string | null> {
  if (f.parentId) {
    if (f.parentId === selfId) throw new ValidationError("A task can't be its own subtask");
    const parent = await repo.findOwnedTask(tx, userId, f.parentId);
    if (!parent) throw new ValidationError('That parent task does not exist');
    if (parent.parentId) throw new ValidationError("A subtask can't have subtasks of its own");
    if (selfId && (await repo.hasSubtasks(tx, selfId)))
      throw new ValidationError("A task that has subtasks can't become a subtask");
    return parent.projectId;
  }
  if (f.projectId && !(await repo.findOwnedProject(tx, userId, f.projectId)))
    throw new ValidationError('That project does not exist');
  return f.projectId;
}

export async function setTags(tx: Executor, userId: string, taskId: string, names: readonly string[]): Promise<void> {
  const wanted = uniqueNames(names);
  const known = await repo.findTagsByName(tx, userId, wanted);
  const added = wanted.length - known.length;
  if (added > 0 && (await repo.countTags(tx, userId)) + added > TASK_LIMITS.tagsPerUser)
    throw new ValidationError(`You can have at most ${TASK_LIMITS.tagsPerUser} tags`);
  await repo.replaceTaskTags(tx, userId, taskId, wanted);
}

async function found(tx: Executor, userId: string, id: string): Promise<TaskOut> {
  const t = await repo.findOwnedTask(tx, userId, id);
  if (!t) throw new NotFoundError();
  return { ...t, reminders: (await repo.listTaskReminders(tx, [t.id])).get(t.id) ?? [] };
}

/** Tasks with their reminders. */
export async function withReminders(db: Executor, list: readonly repo.TaskWithTags[]): Promise<TaskOut[]> {
  const reminders = await repo.listTaskReminders(
    db,
    list.map((t) => t.id),
  );
  return list.map((t) => ({ ...t, reminders: reminders.get(t.id) ?? [] }));
}

export async function listTasks(db: Db, userId: string, completed: boolean): Promise<TaskOut[]> {
  return withReminders(
    db,
    completed
      ? await repo.listCompletedTasks(db, userId, TASK_LIMITS.completedListed)
      : await repo.listOpenTasks(db, userId),
  );
}

export function createTask(
  db: Db,
  userId: string,
  input: Partial<TaskFields> & Pick<TaskFields, 'title' | 'tz'>,
): Promise<TaskOut> {
  const f: TaskFields = { ...EMPTY, ...input };
  checkDue(f);
  return db.transaction(async (tx) => {
    if ((await repo.countOpenTasks(tx, userId)) >= TASK_LIMITS.openPerUser)
      throw new ValidationError(`You can have at most ${TASK_LIMITS.openPerUser} open tasks`);
    const { tags, reminders, ...columns } = f;
    const row = await repo.insertTask(tx, {
      ...columns,
      ownerUserId: userId,
      projectId: await placement(tx, userId, f),
    });
    await setTags(tx, userId, row.id, tags);
    await syncTaskReminders(tx, row, reminders);
    return found(tx, userId, row.id);
  });
}

export function updateTask(db: Db, userId: string, id: string, patch: Partial<TaskFields>): Promise<TaskOut> {
  return db.transaction(async (tx) => {
    const current = await found(tx, userId, id);
    if (Object.keys(patch).length === 0) return current;
    const next = { ...current, ...patch };
    checkDue(next);
    const { tags, reminders, ...columns } = patch;
    if ('projectId' in patch || 'parentId' in patch) {
      columns.projectId = await placement(tx, userId, next, id);
      // A parent's subtasks follow it to its project.
      if (!next.parentId) await repo.setSubtasksProject(tx, id, columns.projectId);
    }
    const row = Object.keys(columns).length ? await repo.updateOwnedTask(tx, userId, id, columns) : undefined;
    if (tags) await setTags(tx, userId, id, tags);
    if (reminders || 'dueDate' in patch || 'dueTime' in patch) await syncTaskReminders(tx, row ?? current, reminders);
    return found(tx, userId, id);
  });
}

/**
 * Completes a task and its open subtasks. A repeating task instead moves to its next due (from
 * today in its zone) and its subtasks open again; once its rule ends it completes like any other.
 */
export function completeTask(db: Db, userId: string, id: string, now = new Date()): Promise<TaskOut> {
  return db.transaction(async (tx) => {
    const t = await found(tx, userId, id);
    if (t.completedAt) return t;
    const today = wallOf(now, t.tz).toISOString().slice(0, 10);
    const next =
      t.rrule && t.dueDate
        ? nextDue({ date: t.dueDate, time: t.dueTime?.slice(0, 5) ?? null, tz: t.tz, rrule: t.rrule }, today)
        : null;
    const row = next
      ? await repo.updateOwnedTask(tx, userId, id, { dueDate: next.date, dueTime: next.time })
      : await repo.updateOwnedTask(tx, userId, id, { completedAt: now });
    if (next) await repo.reopenSubtasks(tx, id);
    else await repo.completeSubtasks(tx, id, now);
    // The reminders move to the next due, or stop.
    if (row) await syncTaskReminders(tx, row, undefined, now);
    return found(tx, userId, id);
  });
}

/** Opens a completed task again, and its parent with it, so an open subtask is never under a done task. */
export function reopenTask(db: Db, userId: string, id: string, now = new Date()): Promise<TaskOut> {
  return db.transaction(async (tx) => {
    const t = await found(tx, userId, id);
    if (!t.completedAt) return t;
    const row = await repo.updateOwnedTask(tx, userId, id, { completedAt: null });
    if (row) await syncTaskReminders(tx, row, undefined, now);
    if (t.parentId) await repo.updateOwnedTask(tx, userId, t.parentId, { completedAt: null });
    return found(tx, userId, id);
  });
}

export async function deleteTask(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteOwnedTask(db, userId, id))) throw new NotFoundError();
}

export type BlockFields = { calendarId: string; start: Date; end: Date };

/**
 * Puts a time block for the task on the calendar: an ordinary event named after it, linked by the
 * task's `scheduled_event_id`. A task that has a block gets it moved (and its calendar changed).
 */
export async function scheduleTask(db: Db, userId: string, id: string, b: BlockFields): Promise<TaskOut> {
  const t = await found(db, userId, id);
  if (t.scheduledEventId) {
    await updateEvent(db, userId, t.scheduledEventId, { calendarId: b.calendarId, start: b.start, end: b.end });
    return found(db, userId, id);
  }
  // Two transactions: if linking fails, the event stays on the calendar as a plain event.
  const event = await createEvent(db, userId, {
    calendarId: b.calendarId,
    summary: t.title,
    description: t.notes,
    location: null,
    start: b.start,
    end: b.end,
    allDay: false,
    tz: t.tz,
    rrule: null,
  });
  await repo.updateOwnedTask(db, userId, id, { scheduledEventId: event.id });
  return found(db, userId, id);
}

/** Takes the task's time block off the calendar (deletes its event). */
export async function unscheduleTask(db: Db, userId: string, id: string): Promise<TaskOut> {
  const t = await found(db, userId, id);
  if (t.scheduledEventId) await deleteEvent(db, userId, t.scheduledEventId);
  return found(db, userId, id);
}
