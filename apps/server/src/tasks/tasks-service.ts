// Tasks for one user: create, change, complete (a repeating task moves to its next due instead),
// reopen and delete. A subtask is one level deep and always in its parent's project.
import { NotFoundError, nextDue, TASK_LIMITS, ValidationError, wallOf } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';

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

async function setTags(tx: Executor, userId: string, taskId: string, names: readonly string[]): Promise<void> {
  const wanted = uniqueNames(names);
  const known = await repo.findTagsByName(tx, userId, wanted);
  const added = wanted.length - known.length;
  if (added > 0 && (await repo.countTags(tx, userId)) + added > TASK_LIMITS.tagsPerUser)
    throw new ValidationError(`You can have at most ${TASK_LIMITS.tagsPerUser} tags`);
  await repo.replaceTaskTags(tx, userId, taskId, wanted);
}

async function found(tx: Executor, userId: string, id: string): Promise<repo.TaskWithTags> {
  const t = await repo.findOwnedTask(tx, userId, id);
  if (!t) throw new NotFoundError();
  return t;
}

export const listTasks = (db: Db, userId: string, completed: boolean): Promise<repo.TaskWithTags[]> =>
  completed ? repo.listCompletedTasks(db, userId, TASK_LIMITS.completedListed) : repo.listOpenTasks(db, userId);

export function createTask(
  db: Db,
  userId: string,
  input: Partial<TaskFields> & Pick<TaskFields, 'title' | 'tz'>,
): Promise<repo.TaskWithTags> {
  const f: TaskFields = { ...EMPTY, ...input };
  checkDue(f);
  return db.transaction(async (tx) => {
    if ((await repo.countOpenTasks(tx, userId)) >= TASK_LIMITS.openPerUser)
      throw new ValidationError(`You can have at most ${TASK_LIMITS.openPerUser} open tasks`);
    const { tags, ...columns } = f;
    const row = await repo.insertTask(tx, {
      ...columns,
      ownerUserId: userId,
      projectId: await placement(tx, userId, f),
    });
    await setTags(tx, userId, row.id, tags);
    return found(tx, userId, row.id);
  });
}

export function updateTask(db: Db, userId: string, id: string, patch: Partial<TaskFields>): Promise<repo.TaskWithTags> {
  return db.transaction(async (tx) => {
    const current = await found(tx, userId, id);
    if (Object.keys(patch).length === 0) return current;
    const next = { ...current, ...patch };
    checkDue(next);
    const { tags, ...columns } = patch;
    if ('projectId' in patch || 'parentId' in patch) {
      columns.projectId = await placement(tx, userId, next, id);
      // A parent's subtasks follow it to its project.
      if (!next.parentId) await repo.setSubtasksProject(tx, id, columns.projectId);
    }
    if (Object.keys(columns).length) await repo.updateOwnedTask(tx, userId, id, columns);
    if (tags) await setTags(tx, userId, id, tags);
    return found(tx, userId, id);
  });
}

/**
 * Completes a task and its open subtasks. A repeating task instead moves to its next due (from
 * today in its zone) and its subtasks open again; once its rule ends it completes like any other.
 */
export function completeTask(db: Db, userId: string, id: string, now = new Date()): Promise<repo.TaskWithTags> {
  return db.transaction(async (tx) => {
    const t = await found(tx, userId, id);
    if (t.completedAt) return t;
    const today = wallOf(now, t.tz).toISOString().slice(0, 10);
    const next =
      t.rrule && t.dueDate
        ? nextDue({ date: t.dueDate, time: t.dueTime?.slice(0, 5) ?? null, tz: t.tz, rrule: t.rrule }, today)
        : null;
    if (next) {
      await repo.updateOwnedTask(tx, userId, id, { dueDate: next.date, dueTime: next.time });
      await repo.reopenSubtasks(tx, id);
    } else {
      await repo.updateOwnedTask(tx, userId, id, { completedAt: now });
      await repo.completeSubtasks(tx, id, now);
    }
    return found(tx, userId, id);
  });
}

/** Opens a completed task again, and its parent with it, so an open subtask is never under a done task. */
export function reopenTask(db: Db, userId: string, id: string): Promise<repo.TaskWithTags> {
  return db.transaction(async (tx) => {
    const t = await found(tx, userId, id);
    if (!t.completedAt) return t;
    await repo.updateOwnedTask(tx, userId, id, { completedAt: null });
    if (t.parentId) await repo.updateOwnedTask(tx, userId, t.parentId, { completedAt: null });
    return found(tx, userId, id);
  });
}

export async function deleteTask(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteOwnedTask(db, userId, id))) throw new NotFoundError();
}
