// Events for one user, or for a calendar shared at edit. Each write runs in one transaction: load,
// plan with @homa/core, write the rows, re-expand the cache. Events always stay the calendar owner's.
import {
  assertWritable,
  type EventFields,
  type EventPatch,
  NotFoundError,
  normalizeReminders,
  opsForChange,
  opsForCreate,
  opsForDelete,
  overrideValues,
  planChange,
  planDelete,
  type Scope,
  ValidationError,
} from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { accessAtLeast, calendarAccess } from './access';
import { requireEditCalendar } from './calendars-service';
import { reexpand } from './instance-cache';
import { enqueueOps } from './outbox';
import type { EventWithReminders } from './responses';

const newUid = (): string => `${crypto.randomUUID()}@homa`;

/** The event with its reminders' minutes. */
async function withReminders(db: Executor, e: repo.EventRow): Promise<EventWithReminders> {
  const list = (await repo.listEventReminders(db, [e.id])).get(e.id) ?? [];
  return { ...e, reminders: list.map((r) => r.minutes) };
}

/** Replaces the event's reminders, keeping each kept offset's action (email from a sync stays email). */
async function writeReminders(tx: Executor, e: repo.EventRow, minutes: readonly number[]): Promise<void> {
  const before = new Map(((await repo.listEventReminders(tx, [e.id])).get(e.id) ?? []).map((r) => [r.minutes, r]));
  const list = normalizeReminders(minutes).map((m) => ({ minutes: m, action: before.get(m)?.action ?? 'display' }));
  await repo.replaceEventReminders(tx, e.ownerUserId, e.id, list);
}

/** Event the viewer can edit (owner or edit grant); calendar must accept writes. */
async function editableEvent(db: Executor, userId: string, id: string): Promise<repo.EventRow> {
  const e = await repo.findEvent(db, id);
  if (!e) throw new NotFoundError();
  const access = await calendarAccess(db, userId, e.calendarId);
  if (!access || !accessAtLeast(access.access, 'edit')) throw new NotFoundError();
  assertWritable(access.calendar);
  return e;
}

/** The columns a patch sets on the event row (times are set from the plan). */
const patchColumns = (p: EventPatch): repo.EventColumns => ({
  ...(p.calendarId !== undefined && { calendarId: p.calendarId }),
  ...(p.summary !== undefined && { summary: p.summary }),
  ...(p.description !== undefined && { description: p.description }),
  ...(p.location !== undefined && { location: p.location }),
  ...(p.allDay !== undefined && { allDay: p.allDay }),
  ...(p.tz !== undefined && { tz: p.tz }),
  ...(p.rrule !== undefined && { rrule: p.rrule }),
  ...(p.travelMinutes !== undefined && { travelMinutes: p.travelMinutes }),
  // All-day events have no travel time.
  ...(p.allDay && { travelMinutes: null }),
});

/** Owner or read+: freebusy and none are 404. Grantees always see reminders: []. */
export async function getEvent(db: Db, userId: string, id: string): Promise<EventWithReminders> {
  const e = await repo.findEvent(db, id);
  if (!e) throw new NotFoundError();
  const access = await calendarAccess(db, userId, e.calendarId);
  if (!access || !accessAtLeast(access.access, 'read')) throw new NotFoundError();
  if (access.access === 'owner') return withReminders(db, e);
  return { ...e, reminders: [] };
}

export function createEvent(
  db: Db,
  userId: string,
  input: EventFields,
  reminders: readonly number[] = [],
): Promise<EventWithReminders> {
  return db.transaction(async (tx) => {
    const calendar = await requireEditCalendar(tx, userId, input.calendarId);
    const ownerId = calendar.ownerUserId;
    const isOwner = ownerId === userId;
    const row = await repo.insertEvent(tx, {
      ownerUserId: ownerId,
      createdByUserId: userId,
      uid: newUid(),
      calendarId: input.calendarId,
      summary: input.summary,
      description: input.description,
      location: input.location,
      startAt: input.start,
      endAt: input.end,
      allDay: input.allDay,
      tz: input.tz,
      rrule: input.rrule,
      travelMinutes: input.allDay ? null : (input.travelMinutes ?? null),
    });
    // Grantees can't set reminders (decision 14).
    await writeReminders(tx, row, isOwner ? reminders : []);
    await reexpand(tx, row.id);
    await enqueueOps(tx, ownerId, opsForCreate(row));
    if (isOwner) return withReminders(tx, row);
    return { ...row, reminders: [] };
  });
}

/**
 * Applies a patch. For recurring events `scope` picks what changes: one occurrence, this and
 * following (the response is then the new series), or the whole series.
 */
export function updateEvent(
  db: Db,
  userId: string,
  id: string,
  patch: EventPatch,
  scope: Scope = 'all',
  recurrenceId?: Date,
): Promise<EventWithReminders> {
  return db.transaction(async (tx) => {
    const e = await editableEvent(tx, userId, id);
    if (patch.calendarId) {
      const target = await requireEditCalendar(tx, userId, patch.calendarId);
      if (target.ownerUserId !== e.ownerUserId)
        throw new ValidationError("You can't move an event into another owner's calendar");
    }
    if (patch.travelMinutes && (patch.allDay ?? e.allDay))
      throw new ValidationError("All-day events can't have travel time");
    const plan = planChange(e, patch, scope, recurrenceId);
    const calendarId = patch.calendarId ?? e.calendarId;
    const ownerId = e.ownerUserId;
    const isOwner = ownerId === userId;

    switch (plan.kind) {
      case 'series': {
        const moved = calendarId !== e.calendarId;
        await repo.updateEventColumns(tx, id, {
          ...patchColumns(patch),
          startAt: plan.start,
          endAt: plan.end,
          exdates: plan.exdates,
          rdates: plan.rdates,
          // In another calendar the event is a new remote resource.
          ...(moved && { remoteHref: null, remoteEtag: null }),
        });
        if (e.rrule) await repo.shiftOverrides(tx, id, plan.shiftMs, plan.durationMs);
        await reexpand(tx, id);
        await enqueueOps(tx, ownerId, opsForChange(e, plan, { calendarId }));
        const row = await repo.findEvent(tx, id);
        if (!row) throw new NotFoundError();
        if (isOwner) return withReminders(tx, row);
        return { ...row, reminders: [] };
      }
      case 'occurrence': {
        const existing = await repo.findOverride(tx, id, plan.recurrenceId);
        await repo.upsertOverride(tx, id, plan.recurrenceId, overrideValues(e, existing, patch, plan.recurrenceId));
        await reexpand(tx, id);
        await enqueueOps(tx, ownerId, opsForChange(e, plan, { calendarId }));
        if (isOwner) return withReminders(tx, e);
        return { ...e, reminders: [] };
      }
      case 'split': {
        const { id: _id, uid: _uid, createdAt: _c, updatedAt: _u, remoteHref: _h, remoteEtag: _t, ...rest } = e;
        const created = await repo.insertEvent(tx, {
          ...rest,
          ...patchColumns(patch),
          uid: newUid(),
          startAt: plan.start,
          endAt: plan.end,
          rrule: plan.rrule,
          exdates: plan.exdates,
          rdates: plan.rdates,
        });
        await repo.shiftOverrides(tx, id, plan.shiftMs, plan.durationMs, {
          from: plan.recurrenceId,
          toEventId: created.id,
        });
        await repo.updateEventColumns(tx, id, {
          rrule: plan.previousRrule,
          exdates: plan.previousExdates,
          rdates: plan.previousRdates,
        });
        await writeReminders(tx, created, (await withReminders(tx, e)).reminders);
        await reexpand(tx, id);
        await reexpand(tx, created.id);
        await enqueueOps(tx, ownerId, opsForChange(e, plan, { calendarId, created }));
        if (isOwner) return withReminders(tx, created);
        return { ...created, reminders: [] };
      }
    }
  });
}

export async function deleteEvent(
  db: Db,
  userId: string,
  id: string,
  scope: Scope = 'all',
  recurrenceId?: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const e = await editableEvent(tx, userId, id);
    const plan = planDelete(e, scope, recurrenceId);
    await enqueueOps(tx, e.ownerUserId, opsForDelete(e, plan));
    switch (plan.kind) {
      case 'event':
        await repo.deleteEvent(tx, id);
        return;
      case 'occurrence':
        await repo.updateEventColumns(tx, id, { exdates: plan.exdates });
        await repo.deleteOverrides(tx, id, plan.recurrenceId);
        break;
      case 'following':
        await repo.updateEventColumns(tx, id, { rrule: plan.rrule, exdates: plan.exdates, rdates: plan.rdates });
        await repo.deleteOverrides(tx, id, plan.recurrenceId, true);
        break;
    }
    await reexpand(tx, id);
  });
}

/**
 * Replaces the event's reminders. Owner only (decision 14). Works on read-only calendars too: there
 * they stay local (pulls leave them alone); on two-way calendars the event is pushed with them.
 */
export function setEventReminders(
  db: Db,
  userId: string,
  id: string,
  minutes: readonly number[],
): Promise<EventWithReminders> {
  return db.transaction(async (tx) => {
    const e = await repo.findOwnedEvent(tx, userId, id);
    if (!e) throw new NotFoundError();
    await writeReminders(tx, e, minutes);
    await enqueueOps(tx, userId, opsForCreate(e));
    return withReminders(tx, e);
  });
}
