// The bell: a user's open notifications, and snooze, done and mark-read on them.
import { NotFoundError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { completeTask } from '@/tasks/tasks-service';

/** Most notifications the bell lists. */
export const LIST_LIMIT = 50;

export async function listNotifications(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ items: repo.NotificationRow[]; unread: number }> {
  const [items, unread] = await Promise.all([
    repo.listOpenNotifications(db, userId, now, LIST_LIMIT),
    repo.countUnread(db, userId, now),
  ]);
  return { items, unread };
}

export const markAllRead = (db: Db, userId: string, now = new Date()): Promise<void> =>
  repo.markAllRead(db, userId, now);

/** Hides the notification until `until`; then the delivery job brings it back, unread, and sends it again. */
export async function snooze(db: Db, userId: string, id: string, until: Date): Promise<repo.NotificationRow> {
  const row = await repo.updateOwnedNotification(db, userId, id, { snoozedUntil: until });
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Done: gone from the bell. A one-off standalone reminder is done with it; a repeating one goes on.
 * A task reminder's task is completed (a repeating task moves to its next due).
 */
export async function done(db: Db, userId: string, id: string, now = new Date()): Promise<repo.NotificationRow> {
  const row = await doneRow(db, userId, id, now);
  if (row.taskId) await completeTask(db, userId, row.taskId, now);
  return row;
}

function doneRow(db: Db, userId: string, id: string, now: Date): Promise<repo.NotificationRow> {
  return db.transaction(async (tx) => {
    const row = await repo.updateOwnedNotification(tx, userId, id, { doneAt: now, snoozedUntil: null, readAt: now });
    if (!row) throw new NotFoundError();
    if (row.reminderId && !row.eventId) {
      const r = await repo.findOwnedStandalone(tx, userId, row.reminderId);
      if (r && !r.rrule) await repo.updateStandalone(tx, userId, r.id, { doneAt: now });
    }
    return row;
  });
}
