// Inputs for resolving calendar access (phase 6b). Effective level is computed in the service with
// resolveAccess from @homa/core — SQL only gathers person grants, circle grants, defaults and presets.
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Executor } from '../client';
import { users } from '../schema/auth';
import { calendars } from '../schema/calendar';
import { calendarGrants, type GrantLevel, type SharingPreset } from '../schema/grants';
import { circleMembers, circles } from '../schema/people';
import type { CalendarRow } from './calendars';

export type SharedAccessInput = {
  calendar: CalendarRow;
  ownerName: string;
  ownerPreset: SharingPreset;
  /** Explicit person grant; null when none is set. A set `none` still wins over circles. */
  personGrant: GrantLevel | null;
  circleGrants: GrantLevel[];
};

/** One calendar by id, any owner. */
export async function findCalendar(db: Executor, id: string): Promise<CalendarRow | undefined> {
  const [row] = await db.select().from(calendars).where(eq(calendars.id, id));
  return row;
}

/** Calendars the viewer does not own, with everything resolveAccess needs. Optional id filter. */
export async function listSharedAccessInputs(
  db: Executor,
  viewerId: string,
  calendarIds?: readonly string[],
): Promise<SharedAccessInput[]> {
  if (calendarIds && !calendarIds.length) return [];

  const rows = await db
    .select({
      calendar: calendars,
      ownerName: users.name,
      ownerPreset: users.sharingPreset,
      personGrant: calendarGrants.level,
    })
    .from(calendars)
    .innerJoin(users, eq(users.id, calendars.ownerUserId))
    .leftJoin(
      calendarGrants,
      and(eq(calendarGrants.calendarId, calendars.id), eq(calendarGrants.granteeUserId, viewerId)),
    )
    .where(
      and(
        ne(calendars.ownerUserId, viewerId),
        calendarIds?.length ? inArray(calendars.id, [...calendarIds]) : undefined,
      ),
    );

  if (!rows.length) return [];

  const ids = rows.map((r) => r.calendar.id);
  const circleRows = await db
    .select({ calendarId: calendarGrants.calendarId, level: calendarGrants.level })
    .from(calendarGrants)
    .innerJoin(circles, eq(circles.id, calendarGrants.circleId))
    .innerJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), eq(circleMembers.userId, viewerId)))
    .innerJoin(calendars, eq(calendars.id, calendarGrants.calendarId))
    .where(and(inArray(calendarGrants.calendarId, ids), eq(circles.ownerUserId, calendars.ownerUserId)));

  const byCalendar = Map.groupBy(circleRows, (r) => r.calendarId);

  return rows.map((r) => ({
    calendar: r.calendar,
    ownerName: r.ownerName,
    ownerPreset: r.ownerPreset,
    personGrant: r.personGrant,
    circleGrants: (byCalendar.get(r.calendar.id) ?? []).map((g) => g.level),
  }));
}

/** Access inputs for one calendar the viewer may or may not own. Undefined when the id is missing. */
export async function findAccessInput(
  db: Executor,
  viewerId: string,
  calendarId: string,
): Promise<(SharedAccessInput & { isOwner: boolean }) | undefined> {
  const [row] = await db
    .select({
      calendar: calendars,
      ownerName: users.name,
      ownerPreset: users.sharingPreset,
    })
    .from(calendars)
    .innerJoin(users, eq(users.id, calendars.ownerUserId))
    .where(eq(calendars.id, calendarId));
  if (!row) return undefined;

  if (row.calendar.ownerUserId === viewerId) {
    return {
      calendar: row.calendar,
      ownerName: row.ownerName,
      ownerPreset: row.ownerPreset,
      personGrant: null,
      circleGrants: [],
      isOwner: true,
    };
  }

  const [person] = await db
    .select({ level: calendarGrants.level })
    .from(calendarGrants)
    .where(and(eq(calendarGrants.calendarId, calendarId), eq(calendarGrants.granteeUserId, viewerId)));

  const circleRows = await db
    .select({ level: calendarGrants.level })
    .from(calendarGrants)
    .innerJoin(circles, eq(circles.id, calendarGrants.circleId))
    .innerJoin(circleMembers, and(eq(circleMembers.circleId, circles.id), eq(circleMembers.userId, viewerId)))
    .where(and(eq(calendarGrants.calendarId, calendarId), eq(circles.ownerUserId, row.calendar.ownerUserId)));

  return {
    calendar: row.calendar,
    ownerName: row.ownerName,
    ownerPreset: row.ownerPreset,
    personGrant: person?.level ?? null,
    circleGrants: circleRows.map((g) => g.level),
    isOwner: false,
  };
}

/** Display names for user ids (missing ids are left out). */
export async function userNames(db: Executor, ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r.name]));
}
