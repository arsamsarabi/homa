// Todoist's project CSV (Settings → Export as a template, or the files in a backup ZIP), read into
// tasks. Pure, so the server and tests share it. The format and the choices are in
// docs/design/phase-5-tasks.md ("Todoist import").
import { parseQuickAdd } from '../quick-add/parse';
import { wallOf } from '../time';
import { TASK_LIMITS, type TaskPriority } from './tasks';

export type TodoistTask = {
  title: string;
  notes: string | null;
  priority: TaskPriority;
  tags: string[];
  dueDate: string | null;
  dueTime: string | null;
  rrule: string | null;
  tz: string;
  /** Subtasks one level deep; Todoist's deeper levels are flattened onto the top-level task. */
  subtasks: TodoistTask[];
};

export type TodoistProject = {
  tasks: TodoistTask[];
  /** Due dates the quick-add parser couldn't read fully; their text is kept in the task's notes. */
  unreadDates: number;
  /** Sections, which Homa doesn't have; their tasks are imported without them. */
  sections: number;
};

/** RFC 4180 CSV: quoted fields with "" for a quote, and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const validZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Todoist's p1 (1 in the file) is the highest; Homa's 3 is.
const PRIORITY: Record<string, TaskPriority> = { '1': 3, '2': 2, '3': 1, '4': 0 };

/** Labels are "@name" words in the task's text. */
const LABEL = /(^|\s)@([\p{L}\p{N}_-]+)/gu;

type Due = Pick<TodoistTask, 'dueDate' | 'dueTime' | 'rrule'>;

/** A Todoist date string ("every mon", "Dec 5 17:00") read with the quick-add parser, or null. */
function dueOf(text: string, tz: string, now: Date): Due | null {
  const q = parseQuickAdd(text, { now, tz, weekStart: 1 });
  if (q.defaulted || q.title.trim()) return null;
  if (q.allDay) return { dueDate: q.start.toISOString().slice(0, 10), dueTime: null, rrule: q.rrule };
  const w = wallOf(q.start, tz).toISOString();
  return { dueDate: w.slice(0, 10), dueTime: w.slice(11, 16), rrule: q.rrule };
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/**
 * Reads one project's CSV. `tz` is the zone for tasks the file gives none for; `now` anchors
 * dates without a year. Throws on a file that isn't a Todoist CSV.
 */
export function readTodoistCsv(text: string, tz: string, now: Date): TodoistProject {
  const [head, ...rows] = parseCsv(text);
  const col = new Map((head ?? []).map((h, i) => [h.trim().toUpperCase(), i]));
  if (!col.has('TYPE') || !col.has('CONTENT'))
    throw new Error('This is not a Todoist CSV export (no TYPE and CONTENT columns)');
  const get = (r: string[], name: string): string => (r[col.get(name) ?? -1] ?? '').trim();

  const tasks: TodoistTask[] = [];
  let last: TodoistTask | undefined;
  let unreadDates = 0;
  let sections = 0;
  for (const r of rows) {
    const type = get(r, 'TYPE').toLowerCase();
    if (type === 'section') sections++;
    if (type === 'note' && last) {
      const note = get(r, 'CONTENT');
      if (note) last.notes = clip(last.notes ? `${last.notes}\n\n${note}` : note, TASK_LIMITS.notes);
    }
    if (type !== 'task') continue;

    const content = get(r, 'CONTENT');
    const tags = [...content.matchAll(LABEL)].map((m) => clip(m[2] ?? '', TASK_LIMITS.tagName));
    const title = clip(content.replace(LABEL, '$1').replace(/\s+/g, ' ').trim() || content, TASK_LIMITS.title);
    if (!title) continue;
    const zone = get(r, 'TIMEZONE');
    const taskTz = zone && validZone(zone) ? zone : tz;
    const date = get(r, 'DATE');
    const due = date ? dueOf(date, taskTz, now) : null;
    if (date && !due) unreadDates++;
    const description = get(r, 'DESCRIPTION');
    const notes = [description, date && !due ? `Todoist date: ${date}` : ''].filter(Boolean).join('\n\n');
    const task: TodoistTask = {
      title,
      notes: notes ? clip(notes, TASK_LIMITS.notes) : null,
      priority: PRIORITY[get(r, 'PRIORITY')] ?? 0,
      tags: [...new Set(tags)].slice(0, TASK_LIMITS.tagsPerTask),
      dueDate: due?.dueDate ?? null,
      dueTime: due?.dueTime ?? null,
      rrule: due?.rrule ?? null,
      tz: taskTz,
      subtasks: [],
    };
    const indent = Number(get(r, 'INDENT')) || 1;
    const parent = tasks.at(-1);
    if (indent > 1 && parent) parent.subtasks.push(task);
    else tasks.push(task);
    last = task;
  }
  return { tasks, unreadDates, sections };
}
