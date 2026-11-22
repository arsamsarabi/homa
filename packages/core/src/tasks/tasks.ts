// Task rules: limits, and when a repeating task is due next. See docs/design/phase-5-tasks.md.
//
// A task's due is a wall date (and optionally a time) in the task's zone, the way VTODO's DUE and
// Todoist's due work. A repeating task is one row: completing it moves the due to its next
// occurrence instead of making a new task.
import { expand } from '../recurrence';
import { instantOf, wallOf } from '../time';

export const TASK_LIMITS = {
  title: 500,
  notes: 10_000,
  /** Open (not completed) tasks per user, subtasks included. */
  openPerUser: 5_000,
  /** Completed tasks the completed list returns, newest first. */
  completedListed: 200,
  projectsPerUser: 300,
  projectName: 100,
  tagsPerUser: 500,
  tagName: 50,
  tagsPerTask: 20,
} as const;

/** 0 none, 1 low, 2 medium, 3 high. */
export const TASK_PRIORITIES = [0, 1, 2, 3] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskDue = {
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM, or null for a date-only due. */
  time: string | null;
  tz: string;
  rrule: string;
};

const DAY: number = 86_400_000;
/** A yearly rule has an occurrence within two years. */
const WINDOW_MS: number = 2 * 366 * DAY;

const utcDate = (date: string): Date => new Date(`${date}T00:00:00Z`);
const wall = (date: string, time: string | null): Date => new Date(`${date}T${time ?? '00:00'}:00Z`);

/**
 * The due after completing a repeating task on `today` (YYYY-MM-DD in the task's zone): the first
 * occurrence after its current due that isn't before today, so an overdue daily task lands on
 * today rather than on a day that has already passed. Null once the rule has ended.
 * @example nextDue({ date: '2026-11-18', time: null, tz: 'UTC', rrule: 'FREQ=DAILY' }, '2026-11-21') // { date: '2026-11-21', time: null }
 */
export function nextDue(d: TaskDue, today: string): { date: string; time: string | null } | null {
  // Date-only dues repeat in UTC on their dates; timed ones in wall-clock time in their zone.
  const zone = d.time ? d.tz : 'UTC';
  const start = d.time ? instantOf(wall(d.date, d.time), d.tz) : utcDate(d.date);
  const dayStart = d.time ? instantOf(utcDate(today), d.tz) : utcDate(today);
  const from = new Date(Math.max(start.getTime(), dayStart.getTime()));
  const next = expand(
    { start, end: new Date(start.getTime() + 1000), tz: zone, rrule: d.rrule, exdates: [] },
    from,
    new Date(from.getTime() + WINDOW_MS),
  ).find((o) => o.start > start && o.start >= dayStart);
  if (!next) return null;
  const w = d.time ? wallOf(next.start, d.tz) : next.start;
  const iso = w.toISOString();
  return { date: iso.slice(0, 10), time: d.time ? iso.slice(11, 16) : null };
}
