// Calendar grant checks for route handlers (phase 6b). One place decides: resolveAccess over
// repo inputs, then every read/write path goes through accessibleCalendars or calendarAccess.
import { type AccessLevel, accessAtLeast, resolveAccess } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';

/** A calendar the viewer can see at freebusy or higher (own or shared). */
export type AccessibleCalendar = {
  calendar: repo.CalendarRow;
  access: Exclude<AccessLevel, 'none'>;
  owner: { id: string; name: string };
  /** Own calendars use calendars.hidden; shared ones use the viewer's shared_calendar_prefs. */
  hidden: boolean;
};

export { accessAtLeast };

/** Effective access for one calendar, or undefined when the id is missing or access is none. */
export async function calendarAccess(
  db: Executor,
  userId: string,
  calendarId: string,
): Promise<AccessibleCalendar | undefined> {
  const input = await repo.findAccessInput(db, userId, calendarId);
  if (!input) return undefined;
  const access = resolveAccess({
    isOwner: input.isOwner,
    personGrant: input.personGrant,
    circleGrants: input.circleGrants,
    calendarDefault: input.calendar.defaultAccess,
    ownerPreset: input.ownerPreset,
  });
  if (access === 'none') return undefined;
  let hidden = input.calendar.hidden;
  if (!input.isOwner) {
    const prefs = await repo.listSharedCalendarPrefs(db, userId);
    hidden = prefs.find((p) => p.calendarId === calendarId)?.hidden ?? false;
  }
  return {
    calendar: input.calendar,
    access,
    owner: { id: input.calendar.ownerUserId, name: input.ownerName },
    hidden,
  };
}

/**
 * Own calendars first (oldest first), then shared ones at freebusy+. Optional `calendarIds`
 * filters the result; ids the viewer cannot see are left out.
 */
export async function accessibleCalendars(
  db: Db | Executor,
  userId: string,
  calendarIds?: readonly string[],
): Promise<AccessibleCalendar[]> {
  if (calendarIds && !calendarIds.length) return [];

  const [owned, sharedInputs, prefs, names] = await Promise.all([
    repo.listCalendars(db, userId),
    repo.listSharedAccessInputs(db, userId, calendarIds),
    repo.listSharedCalendarPrefs(db, userId),
    repo.userNames(db, [userId]),
  ]);
  const hiddenShared = new Map(prefs.map((p) => [p.calendarId, p.hidden]));
  const ownName = names.get(userId) ?? '';

  const own = owned
    .filter((c) => !calendarIds || calendarIds.includes(c.id))
    .map(
      (calendar): AccessibleCalendar => ({
        calendar,
        access: 'owner',
        owner: { id: userId, name: ownName },
        hidden: calendar.hidden,
      }),
    );

  const shared: AccessibleCalendar[] = [];
  for (const input of sharedInputs) {
    const access = resolveAccess({
      isOwner: false,
      personGrant: input.personGrant,
      circleGrants: input.circleGrants,
      calendarDefault: input.calendar.defaultAccess,
      ownerPreset: input.ownerPreset,
    });
    if (access === 'none' || !accessAtLeast(access, 'freebusy')) continue;
    shared.push({
      calendar: input.calendar,
      access,
      owner: { id: input.calendar.ownerUserId, name: input.ownerName },
      hidden: hiddenShared.get(input.calendar.id) ?? false,
    });
  }

  shared.sort((a, b) => a.calendar.createdAt.getTime() - b.calendar.createdAt.getTime());
  return [...own, ...shared];
}
