// Owner-only calendar grants and default access (phase 6b).
import { NotFoundError, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { GRANT_LIMITS } from './schemas';

export type GrantPut = {
  defaultAccess: 'none' | 'freebusy' | 'read' | null;
  grants: readonly (
    | { userId: string; circleId?: undefined; level: repo.CalendarGrantRow['level'] }
    | { circleId: string; userId?: undefined; level: repo.CalendarGrantRow['level'] }
  )[];
};

export type GrantsView = {
  defaultAccess: 'none' | 'freebusy' | 'read' | null;
  grants: repo.CalendarGrantRow[];
};

async function ownCalendar(db: Db, userId: string, calendarId: string): Promise<repo.CalendarRow> {
  const calendar = await repo.findOwnedCalendar(db, userId, calendarId);
  if (!calendar) throw new NotFoundError();
  return calendar;
}

export async function getGrants(db: Db, userId: string, calendarId: string): Promise<GrantsView> {
  const calendar = await ownCalendar(db, userId, calendarId);
  return { defaultAccess: calendar.defaultAccess, grants: await repo.listCalendarGrants(db, calendarId) };
}

export async function putGrants(db: Db, userId: string, calendarId: string, input: GrantPut): Promise<GrantsView> {
  return db.transaction(async (tx) => {
    await ownCalendar(tx, userId, calendarId);
    if (input.grants.length > GRANT_LIMITS.grantsPerCalendar)
      throw new ValidationError(`A calendar can have at most ${GRANT_LIMITS.grantsPerCalendar} grants`);

    const personIds = [...new Set(input.grants.flatMap((g) => ('userId' in g && g.userId ? [g.userId] : [])))];
    const circleIds = [...new Set(input.grants.flatMap((g) => ('circleId' in g && g.circleId ? [g.circleId] : [])))];
    if (personIds.includes(userId)) throw new ValidationError("You can't grant a calendar to yourself");
    if (personIds.length) {
      const found = await repo.existingUserIds(tx, personIds);
      if (personIds.some((id) => !found.has(id))) throw new ValidationError('Unknown person');
    }
    for (const circleId of circleIds) {
      if (!(await repo.findOwnedCircle(tx, userId, circleId))) throw new ValidationError('Unknown circle');
    }

    const targets: repo.GrantTarget[] = input.grants.map((g) =>
      g.userId ? { userId: g.userId, level: g.level } : { circleId: g.circleId as string, level: g.level },
    );
    if (!(await repo.setCalendarDefaultAccess(tx, userId, calendarId, input.defaultAccess))) throw new NotFoundError();
    const grants = await repo.replaceCalendarGrants(tx, calendarId, targets);
    const calendar = await repo.findOwnedCalendar(tx, userId, calendarId);
    if (!calendar) throw new NotFoundError();
    return { defaultAccess: calendar.defaultAccess, grants };
  });
}
