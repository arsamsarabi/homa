// Database rows to API responses.
import type { repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import { notificationKind } from './channels';
import type { Notification, Reminder } from './schemas';

/** A standalone reminder (its row always has a title, start and zone: a check enforces it). */
export const reminderOut = (r: repo.ReminderRow): z.infer<typeof Reminder> => ({
  id: r.id,
  title: r.title ?? '',
  at: (r.startsAt ?? r.createdAt).toISOString(),
  tz: r.tz ?? 'UTC',
  rrule: r.rrule,
  nextFireAt: r.nextFireAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

export const notificationOut = (n: repo.NotificationRow): z.infer<typeof Notification> => ({
  id: n.id,
  kind: notificationKind(n),
  taskId: n.taskId,
  pollId: n.pollId,
  title: n.title,
  start: n.occurrenceStart.toISOString(),
  allDay: n.allDay,
  eventId: n.eventId,
  recurrenceId: n.recurrenceId?.toISOString() ?? null,
  fireAt: n.fireAt.toISOString(),
  read: n.readAt !== null,
});
