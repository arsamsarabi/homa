// Database rows to API responses.
import type { repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import type { Project, Tag, Task } from './schemas';

/** A task with its reminders (minutes before its due). */
export type TaskOut = repo.TaskWithTags & { reminders: number[] };

export const taskOut = (t: TaskOut): z.infer<typeof Task> => ({
  id: t.id,
  uid: t.uid,
  title: t.title,
  notes: t.notes,
  projectId: t.projectId,
  parentId: t.parentId,
  tags: t.tags,
  priority: t.priority,
  dueDate: t.dueDate,
  // Postgres gives HH:MM:SS.
  dueTime: t.dueTime?.slice(0, 5) ?? null,
  tz: t.tz,
  rrule: t.rrule,
  reminders: t.reminders,
  block:
    t.scheduledEventId && t.blockStart && t.blockEnd && t.blockCalendarId
      ? {
          eventId: t.scheduledEventId,
          calendarId: t.blockCalendarId,
          start: t.blockStart.toISOString(),
          end: t.blockEnd.toISOString(),
        }
      : null,
  completedAt: t.completedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

export const projectOut = (p: repo.ProjectRow): z.infer<typeof Project> => ({
  id: p.id,
  name: p.name,
  color: p.color,
  createdAt: p.createdAt.toISOString(),
});

export const tagOut = (t: repo.TagRow): z.infer<typeof Tag> => ({ id: t.id, name: t.name });
