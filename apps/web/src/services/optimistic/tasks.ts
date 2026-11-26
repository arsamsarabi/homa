// Pure helpers to patch the open-tasks cache for optimistic writes.
import type { TaskPatch } from '@/api';
import type { Task } from '@/schemas';

/** Drop a task (and its subtasks) after a delete. */
export const withoutTask = (list: readonly Task[], id: string): Task[] =>
  list.filter((t) => t.id !== id && t.parentId !== id);

/** Patch one task in the open list. */
export function withTaskPatch(list: readonly Task[], id: string, patch: TaskPatch): Task[] {
  return list.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

/** Remove a completed task from the open list. */
export const withoutCompleted = (list: readonly Task[], id: string): Task[] => list.filter((t) => t.id !== id);
