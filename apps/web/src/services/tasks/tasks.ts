// The task lists: which open tasks each list shows and how they group, and the quick-add line for a
// task. Pure, so it tests without React. See docs/design/phase-5-tasks.md ("Lists").
//
// Dates are YYYY-MM-DD strings. A task's due date is a wall date in its own zone; "today" is the
// date in the viewer's zone (the home zone, else the browser's), as the calendar uses.
import { parseQuickAdd, type QuickAddContext } from '@homa/core/quick-add';
import type { TaskInput } from '@/api';
import type { Task, TasksSearch } from '@/schemas';
import { addDays, isoDate } from '@/services/dates';
import { instantOf, wallOf } from '@/services/zones';

export type TaskView =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'completed' }
  | { kind: 'project'; id: string }
  | { kind: 'tag'; name: string };

/** The list a URL shows: a project, a tag, or a named list (Today by default). */
export function viewOf(s: TasksSearch): TaskView {
  if (s.project) return { kind: 'project', id: s.project };
  if (s.tag) return { kind: 'tag', name: s.tag };
  return { kind: s.list ?? 'today' };
}

/** A task, the subtasks shown under it, and its parent when it is shown on its own. */
export type TaskItem = { task: Task; subtasks: readonly Task[]; parent?: Task };
export type SectionHeading = { kind: 'none' } | { kind: 'overdue' } | { kind: 'day'; date: string };
export type TaskSection = { id: string; heading: SectionHeading; items: TaskItem[] };

export type DueState = 'overdue' | 'today' | 'later';

/** Whether a task is late, due today or later. A timed task due earlier today is late. */
export function dueState(t: Task, today: string, now: Date): DueState | undefined {
  if (!t.dueDate) return undefined;
  if (t.dueDate < today) return 'overdue';
  if (t.dueDate > today) return 'later';
  if (t.dueTime && instantOf(new Date(`${t.dueDate}T${t.dueTime}:00Z`), t.tz) < now) return 'overdue';
  return 'today';
}

/** "today", "tomorrow" or "yesterday" for a date near today. */
export function relativeDay(date: string, today: string): 'today' | 'tomorrow' | 'yesterday' | undefined {
  const t = new Date(`${today}T00:00:00Z`);
  if (date === today) return 'today';
  if (date === isoDate(addDays(t, 1))) return 'tomorrow';
  if (date === isoDate(addDays(t, -1))) return 'yesterday';
  return undefined;
}

const nested = (tasks: readonly Task[], keep: (t: Task) => boolean): TaskItem[] => {
  const subs = Map.groupBy(
    tasks.filter((t) => t.parentId),
    (t) => t.parentId ?? '',
  );
  return tasks.filter((t) => !t.parentId && keep(t)).map((task) => ({ task, subtasks: subs.get(task.id) ?? [] }));
};

const flat = (tasks: readonly Task[], keep: (t: Task) => boolean): TaskItem[] => {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.filter(keep).map((task) => ({
    task,
    subtasks: [],
    parent: task.parentId ? byId.get(task.parentId) : undefined,
  }));
};

const one = (items: TaskItem[]): TaskSection[] =>
  items.length ? [{ id: 'all', heading: { kind: 'none' }, items }] : [];

/**
 * The sections a list shows. `open` is every open task (soonest due first, as the API sorts them)
 * and `completed` the recently completed ones. Inbox and projects nest subtasks under their task;
 * the dated lists and tags show each task on its own, with its parent named.
 */
export function sectionsFor(
  view: TaskView,
  open: readonly Task[],
  completed: readonly Task[],
  today: string,
): TaskSection[] {
  switch (view.kind) {
    case 'inbox':
      return one(nested(open, (t) => t.projectId === null));
    case 'project':
      return one(nested(open, (t) => t.projectId === view.id));
    case 'tag': {
      const name = view.name.toLowerCase();
      return one(flat(open, (t) => t.tags.some((g) => g.toLowerCase() === name)));
    }
    case 'completed':
      return one(flat(completed, () => true));
    case 'today': {
      const overdue = flat(open, (t) => t.dueDate !== null && t.dueDate < today);
      const due = flat(open, (t) => t.dueDate === today);
      return [
        ...(overdue.length ? [{ id: 'overdue', heading: { kind: 'overdue' } as const, items: overdue }] : []),
        ...(due.length ? [{ id: today, heading: { kind: 'day', date: today } as const, items: due }] : []),
      ];
    }
    case 'upcoming': {
      const later = flat(open, (t) => t.dueDate !== null && t.dueDate > today);
      return [...Map.groupBy(later, (i) => i.task.dueDate ?? '')].map(([date, items]) => ({
        id: date,
        heading: { kind: 'day', date },
        items,
      }));
    }
  }
}

export type TaskCounts = { inbox: number; today: number };

/** Counts beside the Inbox and Today links: top-level Inbox tasks, and tasks due today or late. */
export const taskCounts = (open: readonly Task[], today: string): TaskCounts => ({
  inbox: open.filter((t) => !t.parentId && t.projectId === null).length,
  today: open.filter((t) => t.dueDate !== null && t.dueDate <= today).length,
});

/** The due a quick-add line gave, as the API takes it. */
export type ParsedDue = Pick<TaskInput, 'dueDate' | 'dueTime' | 'rrule'>;

/**
 * Reads a quick-add line for a task with the event parser: "Buy milk tomorrow" is due tomorrow,
 * "Pay rent monthly on the 1st" repeats. A line with no date has no due (`due` is undefined).
 */
export function parseTaskLine(text: string, ctx: QuickAddContext): { title: string; due?: ParsedDue } {
  const q = parseQuickAdd(text, ctx);
  const title = q.title || text.trim();
  if (q.defaulted) return { title };
  if (q.allDay) return { title, due: { dueDate: isoDate(q.start), dueTime: null, rrule: q.rrule } };
  const w = wallOf(q.start, ctx.tz).toISOString();
  return { title, due: { dueDate: w.slice(0, 10), dueTime: w.slice(11, 16), rrule: q.rrule } };
}

/** The create body for a quick-add line in a list: the list's project or tag, and Today's date when no due was given. */
export function quickTaskBody(text: string, view: TaskView, ctx: QuickAddContext, today: string): TaskInput {
  const { title, due } = parseTaskLine(text, ctx);
  return {
    title,
    tz: ctx.tz,
    ...(view.kind === 'project' ? { projectId: view.id } : {}),
    ...(view.kind === 'tag' ? { tags: [view.name] } : {}),
    ...(due ?? (view.kind === 'today' ? { dueDate: today } : {})),
  };
}
