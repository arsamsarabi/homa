// Calendar grants and shared-calendar prefs. Circle ownership is checked in the service layer.
import { and, asc, eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { calendars } from '../schema/calendar';
import { calendarGrants, type GrantLevel, sharedCalendarPrefs } from '../schema/grants';

export type CalendarGrantRow = typeof calendarGrants.$inferSelect;
export type SharedCalendarPrefRow = typeof sharedCalendarPrefs.$inferSelect;

export type GrantTarget =
  | { userId: string; circleId?: undefined; level: GrantLevel }
  | { circleId: string; userId?: undefined; level: GrantLevel };

/** All grants on a calendar, person grants first then circle grants, by id. */
export function listCalendarGrants(db: Executor, calendarId: string): Promise<CalendarGrantRow[]> {
  return db
    .select()
    .from(calendarGrants)
    .where(eq(calendarGrants.calendarId, calendarId))
    .orderBy(asc(calendarGrants.granteeUserId), asc(calendarGrants.circleId));
}

/**
 * Replaces every grant on a calendar. Callers have checked ownership and that each circle
 * belongs to the calendar owner, and that the set is within the grants-per-calendar limit.
 */
export async function replaceCalendarGrants(
  db: Executor,
  calendarId: string,
  grants: readonly GrantTarget[],
): Promise<CalendarGrantRow[]> {
  await db.delete(calendarGrants).where(eq(calendarGrants.calendarId, calendarId));
  if (!grants.length) return [];
  return db
    .insert(calendarGrants)
    .values(
      grants.map((g) =>
        'userId' in g
          ? { calendarId, granteeUserId: g.userId, circleId: null, level: g.level }
          : { calendarId, granteeUserId: null, circleId: g.circleId, level: g.level },
      ),
    )
    .returning();
}

/** Sets a calendar's default_access. Returns false when the calendar isn't the owner's. */
export async function setCalendarDefaultAccess(
  db: Executor,
  ownerUserId: string,
  calendarId: string,
  defaultAccess: 'none' | 'freebusy' | 'read' | null,
): Promise<boolean> {
  const rows = await db
    .update(calendars)
    .set({ defaultAccess })
    .where(and(eq(calendars.id, calendarId), eq(calendars.ownerUserId, ownerUserId)))
    .returning({ id: calendars.id });
  return rows.length > 0;
}

/** The viewer's hidden prefs for shared calendars; missing means shown. */
export function listSharedCalendarPrefs(db: Executor, userId: string): Promise<SharedCalendarPrefRow[]> {
  return db.select().from(sharedCalendarPrefs).where(eq(sharedCalendarPrefs.userId, userId));
}

/** Upserts the viewer's hidden flag for a shared calendar. */
export async function setSharedCalendarHidden(
  db: Executor,
  userId: string,
  calendarId: string,
  hidden: boolean,
): Promise<SharedCalendarPrefRow> {
  const [row] = await db
    .insert(sharedCalendarPrefs)
    .values({ userId, calendarId, hidden })
    .onConflictDoUpdate({
      target: [sharedCalendarPrefs.userId, sharedCalendarPrefs.calendarId],
      set: { hidden },
    })
    .returning();
  if (!row) throw new Error('upsert into shared_calendar_prefs returned no row');
  return row;
}
