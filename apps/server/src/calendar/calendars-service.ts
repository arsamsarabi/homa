// Calendars for one user.
import { assertWritable, NotFoundError, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';

export const listCalendars = (db: Db, userId: string): Promise<repo.CalendarRow[]> => repo.listCalendars(db, userId);

export const createCalendar = (db: Db, userId: string, input: repo.CalendarValues): Promise<repo.CalendarRow> =>
  repo.insertCalendar(db, userId, input);

export async function updateCalendar(
  db: Db,
  userId: string,
  id: string,
  input: Partial<repo.CalendarValues>,
): Promise<repo.CalendarRow> {
  const row = await repo.updateCalendar(db, userId, id, input);
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Deletes a calendar; its events, their cached occurrences and its outbox cascade. A connected
 * calendar goes with its connection instead, so the next sync doesn't find it missing, unless it's
 * already gone at the source.
 */
export async function deleteCalendar(db: Db, userId: string, id: string): Promise<void> {
  const calendar = await repo.findOwnedCalendar(db, userId, id);
  if (!calendar) throw new NotFoundError();
  if (calendar.connectionId && !calendar.remoteMissing)
    throw new ValidationError('This calendar is a subscription: remove it under Connected calendars in Settings');
  await repo.deleteCalendar(db, userId, id);
}

/**
 * Throws unless calendar `id` belongs to the user (ValidationError: events can only go in your own
 * calendars) and accepts writes (ReadOnlyError for subscriptions).
 */
export async function requireWritableCalendar(db: Executor, userId: string, id: string): Promise<void> {
  const calendar = await repo.findOwnedCalendar(db, userId, id);
  if (!calendar) throw new ValidationError('Unknown calendar');
  assertWritable(calendar);
}
