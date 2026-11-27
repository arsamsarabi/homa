// Calendars for one user, plus shared calendars they can see (phase 6b).
import { assertWritable, NotFoundError, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { type AccessibleCalendar, accessAtLeast, accessibleCalendars, calendarAccess } from './access';

export const listCalendars = (db: Db, userId: string): Promise<AccessibleCalendar[]> => accessibleCalendars(db, userId);

export async function createCalendar(db: Db, userId: string, input: repo.CalendarValues): Promise<AccessibleCalendar> {
  const calendar = await repo.insertCalendar(db, userId, input);
  const names = await repo.userNames(db, [userId]);
  return {
    calendar,
    access: 'owner',
    owner: { id: userId, name: names.get(userId) ?? '' },
    hidden: calendar.hidden,
    color: calendar.color,
  };
}

export async function updateCalendar(
  db: Db,
  userId: string,
  id: string,
  input: Partial<repo.CalendarValues>,
): Promise<AccessibleCalendar> {
  const access = await calendarAccess(db, userId, id);
  if (!access) throw new NotFoundError();

  if (access.access === 'owner') {
    const row = await repo.updateCalendar(db, userId, id, input);
    if (!row) throw new NotFoundError();
    return { ...access, calendar: row, hidden: row.hidden, color: row.color };
  }

  // Shared calendar: only the viewer's own prefs, hidden (decision 12) and color.
  const { hidden, color, ...rest } = input;
  if ((hidden === undefined && color === undefined) || Object.values(rest).some((v) => v !== undefined))
    throw new NotFoundError();
  const pref = await repo.setSharedCalendarPrefs(db, userId, id, { hidden, color });
  return { ...access, hidden: pref.hidden, color: pref.color ?? access.calendar.color };
}

/**
 * Deletes a calendar; its events, their cached occurrences and its outbox cascade. A connected
 * calendar goes with its connection instead, so the next sync doesn't find it missing, unless it's
 * already gone at the source. Shared calendars cannot be deleted by a grantee.
 */
export async function deleteCalendar(db: Db, userId: string, id: string): Promise<void> {
  const calendar = await repo.findOwnedCalendar(db, userId, id);
  if (!calendar) throw new NotFoundError();
  if (calendar.connectionId && !calendar.remoteMissing)
    throw new ValidationError('This calendar is a subscription: remove it under Connected calendars in Settings');
  await repo.deleteCalendar(db, userId, id);
}

/**
 * Throws unless the viewer has edit (or owns) calendar `id` and it accepts writes.
 * Used when naming a calendar on create or move: insufficient access is a 400.
 */
export async function requireEditCalendar(db: Executor, userId: string, id: string): Promise<repo.CalendarRow> {
  const access = await calendarAccess(db, userId, id);
  if (!access || !accessAtLeast(access.access, 'edit')) throw new ValidationError('Unknown calendar');
  assertWritable(access.calendar);
  return access.calendar;
}
