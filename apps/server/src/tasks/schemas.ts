// Request and response schemas for tasks, projects and tags.
import { normalizeReminders, REMINDER_LIMITS, TASK_LIMITS } from '@homa/core';
import { z } from '@hono/zod-openapi';
import { Repeat, Tz } from '@/reminders';

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #7d7fa3');
const DueDate = z.iso.date().openapi({ example: '2026-11-27' });
const DueTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like 17:30')
  .openapi({ example: '17:30' });
const Reminders = z
  .array(z.int().min(0).max(REMINDER_LIMITS.maxMinutes))
  .max(REMINDER_LIMITS.perEvent)
  .transform(normalizeReminders)
  .openapi({
    example: [0, 60],
    description: `Minutes before the due (09:00 for a date-only due), at most ${REMINDER_LIMITS.perEvent}`,
  });
const When = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const TagName = z.string().trim().min(1).max(TASK_LIMITS.tagName);

export const Task = z
  .object({
    id: z.uuid(),
    uid: z.string().openapi({ description: 'The iCalendar UID' }),
    title: z.string(),
    notes: z.string().nullable(),
    projectId: z.uuid().nullable().openapi({ description: 'Null for the Inbox' }),
    parentId: z.uuid().nullable().openapi({ description: "The parent task's id, for a subtask" }),
    tags: z.array(z.string()),
    priority: z.int().min(0).max(3).openapi({ description: '0 none, 1 low, 2 medium, 3 high' }),
    dueDate: z.string().nullable().openapi({ description: 'YYYY-MM-DD, in the task’s zone' }),
    dueTime: z.string().nullable().openapi({ description: 'HH:MM, or null for a date-only due' }),
    tz: z.string(),
    rrule: z.string().nullable().openapi({ description: 'Repeats from the due date; completing moves it on' }),
    reminders: z.array(z.int()).openapi({ description: 'Minutes before the due' }),
    block: z
      .object({ eventId: z.uuid(), calendarId: z.uuid(), start: z.iso.datetime(), end: z.iso.datetime() })
      .nullable()
      .openapi({ description: 'The time block: an event on the calendar for working on the task' }),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Task');

const TaskFields = z.object({
  title: z.string().trim().min(1).max(TASK_LIMITS.title),
  notes: z.string().max(TASK_LIMITS.notes).nullable(),
  projectId: z.uuid().nullable(),
  parentId: z.uuid().nullable(),
  tags: z.array(TagName).max(TASK_LIMITS.tagsPerTask),
  priority: z.int().min(0).max(3),
  dueDate: DueDate.nullable(),
  dueTime: DueTime.nullable(),
  tz: Tz,
  rrule: Repeat.nullable(),
  reminders: Reminders,
});
export const TaskInput = TaskFields.partial()
  .required({ title: true, tz: true })
  .openapi('TaskInput', { description: 'Omitted fields are empty: Inbox, no tags, no priority, no due' });
export const TaskPatch = TaskFields.partial().openapi('TaskPatch');
export const TaskListQuery = z.object({
  completed: z
    .enum(['true', 'false'])
    .optional()
    .openapi({ description: `true: the ${TASK_LIMITS.completedListed} most recently completed tasks` }),
});

const MAX_BLOCK_MS = 24 * 3_600_000;
export const BlockInput = z
  .object({ calendarId: z.uuid(), start: When, end: When })
  .refine((v) => v.end > v.start, { message: 'end must be after start', path: ['end'] })
  .refine((v) => v.end.getTime() - v.start.getTime() <= MAX_BLOCK_MS, {
    message: 'a time block is at most 24 hours',
    path: ['end'],
  })
  .openapi('TaskBlockInput');

export const Project = z
  .object({ id: z.uuid(), name: z.string(), color: z.string().nullable(), createdAt: z.iso.datetime() })
  .openapi('Project');
export const ProjectInput = z
  .object({ name: z.string().trim().min(1).max(TASK_LIMITS.projectName), color: Color.nullable().optional() })
  .openapi('ProjectInput');
export const ProjectPatch = ProjectInput.partial().openapi('ProjectPatch');

export const Tag = z.object({ id: z.uuid(), name: z.string() }).openapi('Tag');
export const TagPatch = z.object({ name: TagName }).openapi('TagPatch');

export const Id = z.object({ id: z.uuid() });
