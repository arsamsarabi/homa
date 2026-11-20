// Standalone reminders for one user: a title and a time, optionally repeating, with no event.
import { NotFoundError, nextStandaloneFire, REMINDER_LIMITS, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';

export type ReminderFields = { title: string; at: Date; tz: string; rrule: string | null };

const values = (f: ReminderFields, now: Date): repo.StandaloneValues => ({
  title: f.title,
  startsAt: f.at,
  tz: f.tz,
  rrule: f.rrule,
  // A reminder set for a moment ago still fires (within the catch-up window); then it repeats.
  nextFireAt:
    f.at > new Date(now.getTime() - REMINDER_LIMITS.catchUpMs) && f.at <= now
      ? f.at
      : nextStandaloneFire({ startsAt: f.at, tz: f.tz, rrule: f.rrule }, now),
});

export const listReminders = (db: Db, userId: string): Promise<repo.ReminderRow[]> => repo.listStandalone(db, userId);

export function createReminder(db: Db, userId: string, f: ReminderFields, now = new Date()): Promise<repo.ReminderRow> {
  return db.transaction(async (tx) => {
    if ((await repo.countOpenStandalone(tx, userId)) >= REMINDER_LIMITS.standalonePerUser)
      throw new ValidationError(`You can have at most ${REMINDER_LIMITS.standalonePerUser} reminders`);
    return repo.insertStandalone(tx, userId, values(f, now));
  });
}

export function updateReminder(
  db: Db,
  userId: string,
  id: string,
  patch: Partial<ReminderFields>,
  now = new Date(),
): Promise<repo.ReminderRow> {
  return db.transaction(async (tx) => {
    const r = await repo.findOwnedStandalone(tx, userId, id);
    if (!r?.title || !r.startsAt || !r.tz) throw new NotFoundError();
    const next = { title: r.title, at: r.startsAt, tz: r.tz, rrule: r.rrule, ...patch };
    // A changed time is a new schedule; it isn't done any more.
    const row = await repo.updateStandalone(tx, userId, id, { ...values(next, now), doneAt: null });
    if (!row) throw new NotFoundError();
    return row;
  });
}

export async function deleteReminder(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteStandalone(db, userId, id))) throw new NotFoundError();
}
