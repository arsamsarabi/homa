// Runtime schemas for tasks, projects and tags as the API returns them, and the tasks route's
// search params (?list=today, ?project={id}, ?tag={name}).
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const TaskSchema = z.object({
  id: z.string(),
  uid: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  projectId: z.string().nullable(),
  parentId: z.string().nullable(),
  tags: z.array(z.string()),
  /** 0 none, 1 low, 2 medium, 3 high. */
  priority: z.number().int().min(0).max(3),
  /** YYYY-MM-DD in the task's zone. */
  dueDate: z.string().nullable(),
  /** HH:MM, or null for a date-only due. */
  dueTime: z.string().nullable(),
  tz: z.string(),
  rrule: z.string().nullable(),
  /** Minutes before the due (09:00 for a date-only due). */
  reminders: z.array(z.number().int()),
  /** The time block on the calendar. */
  block: z.object({ eventId: z.string(), calendarId: z.string(), start: isoDateTime, end: isoDateTime }).nullable(),
  completedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Task = z.infer<typeof TaskSchema>;
export const TaskListSchema = z.array(TaskSchema);

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  createdAt: isoDateTime,
});
export type Project = z.infer<typeof ProjectSchema>;
export const ProjectListSchema = z.array(ProjectSchema);

export const TagSchema = z.object({ id: z.string(), name: z.string() });
export type Tag = z.infer<typeof TagSchema>;
export const TagListSchema = z.array(TagSchema);

export const TASK_LISTS = ['inbox', 'today', 'upcoming', 'completed'] as const;
export type TaskListName = (typeof TASK_LISTS)[number];

/** Bad values fall back to the default list (Today) instead of failing the route. */
export const TasksSearchSchema = z.object({
  list: z.enum(TASK_LISTS).optional().catch(undefined),
  project: z.string().max(100).optional().catch(undefined),
  tag: z.string().max(100).optional().catch(undefined),
});
export type TasksSearch = z.infer<typeof TasksSearchSchema>;
