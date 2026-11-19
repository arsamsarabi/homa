// Calendars for one user.
import { NotFoundError, ValidationError } from '@homa/core';
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

/** Deletes a calendar; its events and their cached occurrences cascade. */
export async function deleteCalendar(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteCalendar(db, userId, id))) throw new NotFoundError();
}

/** Throws unless calendar `id` belongs to the user: events can only go in your own calendars. */
export async function requireOwnCalendar(db: Executor, userId: string, id: string): Promise<void> {
  if (!(await repo.calendarIsOwned(db, userId, id))) throw new ValidationError('Unknown calendar');
}
