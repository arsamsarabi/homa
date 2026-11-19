// Calendars and events for one user: writes keep event_instances in step, reads query it by range.
import { continueFrom, endBefore, expand, type Occurrence, type Series } from '@homa/core';
import { type Db, schema } from '@homa/db';
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';

const { calendars, events, eventOverrides, eventInstances } = schema;

export type EventRow = typeof events.$inferSelect;
type OverrideRow = typeof eventOverrides.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** How far ahead event_instances holds recurring events. Reads past it expand on the fly. */
export const HORIZON_DAYS = 548; // about 18 months

export class NotFound extends Error {}
export class BadRequest extends Error {}

const horizon = (now = new Date()) => new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
const series = (e: EventRow): Series => ({
  start: e.startAt,
  end: e.endAt,
  tz: e.tz,
  rrule: e.rrule,
  exdates: e.exdates,
});
const range = (a: Date, b: Date) => `[${a.toISOString()},${b.toISOString()})`;
const shift = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** Occurrences of an event in [from, to) with overrides applied (a moved occurrence keeps its recurrence id). */
function occurrences(e: EventRow, overrides: OverrideRow[], from: Date, to: Date): Occurrence[] {
  const byId = new Map(overrides.map((o) => [o.recurrenceId.getTime(), o]));
  // An override can move an occurrence into the range from outside it, so widen the search.
  const span = Math.max(0, ...overrides.map((o) => Math.abs(o.startAt.getTime() - o.recurrenceId.getTime())));
  return expand(series(e), shift(from, -span), shift(to, span))
    .map((occ) => {
      const o = byId.get(occ.recurrenceId.getTime());
      return o ? { recurrenceId: occ.recurrenceId, start: o.startAt, end: o.endAt } : occ;
    })
    .filter((occ) => occ.start < to && occ.end > from);
}

/** Rebuilds an event's rows in event_instances, up to the horizon. */
export async function reexpand(tx: Db | Tx, eventId: string, now = new Date()) {
  const [e] = await tx.select().from(events).where(eq(events.id, eventId));
  await tx.delete(eventInstances).where(eq(eventInstances.eventId, eventId));
  if (!e) return;
  const until = e.rrule ? horizon(now) : null;
  const overrides = await tx.select().from(eventOverrides).where(eq(eventOverrides.eventId, eventId));
  const occ = occurrences(e, overrides, new Date(0), until ?? new Date(8.64e15));
  for (let i = 0; i < occ.length; i += 1000) {
    await tx.insert(eventInstances).values(
      occ.slice(i, i + 1000).map((o) => ({
        eventId: e.id,
        ownerUserId: e.ownerUserId,
        calendarId: e.calendarId,
        recurrenceId: o.recurrenceId,
        during: range(o.start, o.end),
      })),
    );
  }
  await tx.update(events).set({ expandedUntil: until }).where(eq(events.id, eventId));
}

/** Re-expands recurring events whose cached window ends within a month. Run nightly. */
export async function extendHorizon(db: Db, now = new Date()) {
  const due = await db
    .select({ id: events.id })
    .from(events)
    .where(and(isNotNull(events.rrule), lt(events.expandedUntil, shift(horizon(now), -30 * 86_400_000))));
  for (const { id } of due) await db.transaction((tx) => reexpand(tx, id, now));
  return due.length;
}

// --- calendars ---

export const listCalendars = (db: Db, userId: string) =>
  db.select().from(calendars).where(eq(calendars.ownerUserId, userId)).orderBy(asc(calendars.createdAt));

export async function createCalendar(db: Db, userId: string, input: { name: string; color?: string }) {
  const [row] = await db
    .insert(calendars)
    .values({ ownerUserId: userId, ...input })
    .returning();
  if (!row) throw new Error('insert returned nothing');
  return row;
}

export async function updateCalendar(db: Db, userId: string, id: string, input: { name?: string; color?: string }) {
  const [row] = await db
    .update(calendars)
    .set(input)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, userId)))
    .returning();
  if (!row) throw new NotFound();
  return row;
}

export async function deleteCalendar(db: Db, userId: string, id: string) {
  const rows = await db
    .delete(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, userId)))
    .returning({ id: calendars.id });
  if (!rows.length) throw new NotFound();
  await db.delete(eventInstances).where(eq(eventInstances.calendarId, id));
}

async function ownCalendar(db: Db | Tx, userId: string, id: string) {
  const [row] = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.ownerUserId, userId)));
  if (!row) throw new BadRequest('Unknown calendar');
}

// --- events ---

export type EventInput = {
  calendarId: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  tz: string;
  rrule?: string | null;
};

export type EventPatch = Partial<EventInput>;
export type Scope = 'this' | 'following' | 'all';

async function ownEvent(db: Db | Tx, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.ownerUserId, userId)));
  if (!row) throw new NotFound();
  return row;
}

export const getEvent = (db: Db, userId: string, id: string) => ownEvent(db, userId, id);

export async function createEvent(db: Db, userId: string, input: EventInput) {
  return db.transaction(async (tx) => {
    await ownCalendar(tx, userId, input.calendarId);
    const [row] = await tx
      .insert(events)
      .values({
        ownerUserId: userId,
        uid: `${crypto.randomUUID()}@homa`,
        calendarId: input.calendarId,
        summary: input.summary,
        description: input.description ?? null,
        location: input.location ?? null,
        startAt: input.start,
        endAt: input.end,
        allDay: input.allDay,
        tz: input.tz,
        rrule: input.rrule ?? null,
      })
      .returning();
    if (!row) throw new Error('insert returned nothing');
    await reexpand(tx, row.id);
    return ownEvent(tx, userId, row.id);
  });
}

const masterFields = (p: EventPatch) => ({
  ...(p.calendarId !== undefined && { calendarId: p.calendarId }),
  ...(p.summary !== undefined && { summary: p.summary }),
  ...(p.description !== undefined && { description: p.description }),
  ...(p.location !== undefined && { location: p.location }),
  ...(p.start !== undefined && { startAt: p.start }),
  ...(p.end !== undefined && { endAt: p.end }),
  ...(p.allDay !== undefined && { allDay: p.allDay }),
  ...(p.tz !== undefined && { tz: p.tz }),
  ...(p.rrule !== undefined && { rrule: p.rrule }),
});

/**
 * SET clause that moves overrides with the series by `deltaMs`. Overrides that only changed the
 * title or details (start still at their recurrence id) also take the series' new duration.
 */
const followSeries = (deltaMs: number, durationMs: number) => {
  const delta = sql`make_interval(secs => ${deltaMs / 1000})`;
  const unmoved = sql`${eventOverrides.startAt} = ${eventOverrides.recurrenceId}`;
  return {
    recurrenceId: sql`${eventOverrides.recurrenceId} + ${delta}`,
    startAt: sql`case when ${unmoved} then ${eventOverrides.recurrenceId} + ${delta} else ${eventOverrides.startAt} end`,
    endAt: sql`case when ${unmoved} then ${eventOverrides.recurrenceId} + ${delta} + make_interval(secs => ${durationMs / 1000}) else ${eventOverrides.endAt} end`,
  };
};

/** Checks that `recurrenceId` is one of the event's occurrences (cancelled ones don't count). */
function assertOccurrence(e: EventRow, recurrenceId: Date) {
  const hit = expand(series(e), recurrenceId, shift(recurrenceId, 1)).some(
    (o) => o.recurrenceId.getTime() === recurrenceId.getTime(),
  );
  if (!hit) throw new BadRequest('No occurrence at recurrenceId');
}

/**
 * Applies a patch. For recurring events `scope` picks what changes: one occurrence (an
 * override), this and following (the series is split in two), or the whole series.
 */
export async function updateEvent(
  db: Db,
  userId: string,
  id: string,
  patch: EventPatch,
  scope: Scope = 'all',
  recurrenceId?: Date,
) {
  return db.transaction(async (tx) => {
    const e = await ownEvent(tx, userId, id);
    if (patch.calendarId) await ownCalendar(tx, userId, patch.calendarId);
    const start = patch.start ?? e.startAt;
    const end = patch.end ?? (patch.start ? shift(patch.start, e.endAt.getTime() - e.startAt.getTime()) : e.endAt);
    if (end <= start) throw new BadRequest('end must be after start');

    if (!e.rrule || scope === 'all' || (scope === 'following' && recurrenceId?.getTime() === e.startAt.getTime())) {
      // Moving the whole series moves its cancelled and changed occurrences with it.
      const delta = start.getTime() - e.startAt.getTime();
      await tx
        .update(events)
        .set({ ...masterFields(patch), startAt: start, endAt: end, exdates: e.exdates.map((d) => shift(d, delta)) })
        .where(eq(events.id, id));
      if (e.rrule) {
        await tx
          .update(eventOverrides)
          .set(followSeries(delta, end.getTime() - start.getTime()))
          .where(eq(eventOverrides.eventId, id));
      }
      await reexpand(tx, id);
      return ownEvent(tx, userId, id);
    }

    if (!recurrenceId) throw new BadRequest('recurrenceId is required for this scope');
    assertOccurrence(e, recurrenceId);

    if (scope === 'this') {
      if (patch.calendarId || patch.rrule !== undefined || patch.allDay !== undefined || patch.tz)
        throw new BadRequest('Only the title, details and times of one occurrence can change');
      const [existing] = await tx
        .select()
        .from(eventOverrides)
        .where(and(eq(eventOverrides.eventId, id), eq(eventOverrides.recurrenceId, recurrenceId)));
      const duration = e.endAt.getTime() - e.startAt.getTime();
      const oStart = patch.start ?? existing?.startAt ?? recurrenceId;
      const oEnd =
        patch.end ?? (patch.start ? shift(patch.start, duration) : (existing?.endAt ?? shift(recurrenceId, duration)));
      if (oEnd <= oStart) throw new BadRequest('end must be after start');
      const values = {
        summary: patch.summary ?? existing?.summary ?? null,
        description: patch.description !== undefined ? patch.description : (existing?.description ?? null),
        location: patch.location !== undefined ? patch.location : (existing?.location ?? null),
        startAt: oStart,
        endAt: oEnd,
      };
      await tx
        .insert(eventOverrides)
        .values({ eventId: id, recurrenceId, ...values })
        .onConflictDoUpdate({ target: [eventOverrides.eventId, eventOverrides.recurrenceId], set: values });
      await reexpand(tx, id);
      return ownEvent(tx, userId, id);
    }

    // This and following: end the old series before the occurrence, start a new one there.
    const newStart = patch.start ?? recurrenceId;
    const newEnd =
      patch.end ??
      shift(newStart, patch.start ? e.endAt.getTime() - e.startAt.getTime() : end.getTime() - start.getTime());
    const delta = newStart.getTime() - recurrenceId.getTime();
    const [created] = await tx
      .insert(events)
      .values({
        ...e,
        ...masterFields(patch),
        id: undefined,
        uid: `${crypto.randomUUID()}@homa`,
        startAt: newStart,
        endAt: newEnd,
        rrule: patch.rrule !== undefined ? patch.rrule : continueFrom({ ...series(e), rrule: e.rrule }, recurrenceId),
        exdates: e.exdates.filter((d) => d >= recurrenceId).map((d) => shift(d, delta)),
        createdAt: undefined,
        updatedAt: undefined,
      })
      .returning();
    if (!created) throw new Error('insert returned nothing');
    await tx
      .update(eventOverrides)
      .set({ eventId: created.id, ...followSeries(delta, newEnd.getTime() - newStart.getTime()) })
      .where(and(eq(eventOverrides.eventId, id), gte(eventOverrides.recurrenceId, recurrenceId)));
    await tx
      .update(events)
      .set({ rrule: endBefore(e.rrule, recurrenceId), exdates: e.exdates.filter((d) => d < recurrenceId) })
      .where(eq(events.id, id));
    await reexpand(tx, id);
    await reexpand(tx, created.id);
    return ownEvent(tx, userId, created.id);
  });
}

export async function deleteEvent(db: Db, userId: string, id: string, scope: Scope = 'all', recurrenceId?: Date) {
  await db.transaction(async (tx) => {
    const e = await ownEvent(tx, userId, id);
    if (!e.rrule || scope === 'all' || (scope === 'following' && recurrenceId?.getTime() === e.startAt.getTime())) {
      await tx.delete(events).where(eq(events.id, id));
      return;
    }
    if (!recurrenceId) throw new BadRequest('recurrenceId is required for this scope');
    assertOccurrence(e, recurrenceId);
    if (scope === 'this') {
      await tx
        .update(events)
        .set({ exdates: [...e.exdates, recurrenceId] })
        .where(eq(events.id, id));
      await tx
        .delete(eventOverrides)
        .where(and(eq(eventOverrides.eventId, id), eq(eventOverrides.recurrenceId, recurrenceId)));
    } else {
      await tx
        .update(events)
        .set({ rrule: endBefore(e.rrule, recurrenceId), exdates: e.exdates.filter((d) => d < recurrenceId) })
        .where(eq(events.id, id));
      await tx
        .delete(eventOverrides)
        .where(and(eq(eventOverrides.eventId, id), gte(eventOverrides.recurrenceId, recurrenceId)));
    }
    await reexpand(tx, id);
  });
}

// --- reading a range ---

export type OccurrenceView = {
  event: EventRow;
  recurrenceId: Date;
  start: Date;
  end: Date;
  summary: string;
  description: string | null;
  location: string | null;
  overridden: boolean;
};

/** Every occurrence of the user's events overlapping [from, to), sorted by start. */
export async function listOccurrences(db: Db, userId: string, from: Date, to: Date, calendarIds?: string[]) {
  const inCalendars = calendarIds?.length ? inArray(eventInstances.calendarId, calendarIds) : undefined;
  const cached = await db
    .select({
      eventId: eventInstances.eventId,
      recurrenceId: eventInstances.recurrenceId,
      start: sql<Date>`lower(${eventInstances.during})`.mapWith((v: string) => new Date(v)),
      end: sql<Date>`upper(${eventInstances.during})`.mapWith((v: string) => new Date(v)),
    })
    .from(eventInstances)
    .where(
      and(
        eq(eventInstances.ownerUserId, userId),
        sql`${eventInstances.during} && ${range(from, to)}::tstzrange`,
        inCalendars,
      ),
    );

  // Recurring events whose cache stops before `to` are expanded on the fly past their horizon.
  const late = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.ownerUserId, userId),
        isNotNull(events.rrule),
        lt(events.expandedUntil, to),
        lt(events.startAt, to),
        calendarIds?.length ? inArray(events.calendarId, calendarIds) : undefined,
      ),
    );

  const ids = [...new Set([...cached.map((c) => c.eventId), ...late.map((e) => e.id)])];
  if (!ids.length) return [];
  const rows = await db.select().from(events).where(inArray(events.id, ids));
  const overrides = await db.select().from(eventOverrides).where(inArray(eventOverrides.eventId, ids));
  const byEvent = new Map(rows.map((e) => [e.id, e]));
  const key = (eventId: string, rid: Date) => `${eventId}|${rid.getTime()}`;
  const overrideBy = new Map(overrides.map((o) => [key(o.eventId, o.recurrenceId), o]));

  const found = new Map<string, { eventId: string; recurrenceId: Date; start: Date; end: Date }>();
  for (const c of cached) found.set(key(c.eventId, c.recurrenceId), c);
  for (const e of late) {
    const own = overrides.filter((o) => o.eventId === e.id);
    // The cache already has every occurrence whose original start is before expanded_until.
    const after = e.expandedUntil ?? from;
    for (const o of occurrences(e, own, from, to)) {
      if (o.recurrenceId >= after) found.set(key(e.id, o.recurrenceId), { eventId: e.id, ...o });
    }
  }

  return [...found.values()]
    .map((f): OccurrenceView => {
      const event = byEvent.get(f.eventId) as EventRow;
      const o = overrideBy.get(key(f.eventId, f.recurrenceId));
      return {
        event,
        recurrenceId: f.recurrenceId,
        start: f.start,
        end: f.end,
        summary: o?.summary ?? event.summary,
        description: o?.description ?? event.description,
        location: o?.location ?? event.location,
        overridden: Boolean(o),
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
