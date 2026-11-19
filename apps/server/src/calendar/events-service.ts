// Events for one user. Each write runs in one transaction: load, plan with @homa/core, write the
// rows, re-expand the cache.
import {
  type EventFields,
  type EventPatch,
  NotFoundError,
  opsForChange,
  opsForCreate,
  opsForDelete,
  overrideValues,
  planChange,
  planDelete,
  type Scope,
} from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { requireWritableCalendar } from './calendars-service';
import { reexpand } from './instance-cache';
import { enqueueOps } from './outbox';

const newUid = (): string => `${crypto.randomUUID()}@homa`;

async function ownEvent(db: Executor, userId: string, id: string): Promise<repo.EventRow> {
  const e = await repo.findOwnedEvent(db, userId, id);
  if (!e) throw new NotFoundError();
  return e;
}

/** The user's event, if its calendar accepts changes (ReadOnlyError for a subscription's events). */
async function writableEvent(db: Executor, userId: string, id: string): Promise<repo.EventRow> {
  const e = await ownEvent(db, userId, id);
  await requireWritableCalendar(db, userId, e.calendarId);
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
});

export const getEvent = (db: Db, userId: string, id: string): Promise<repo.EventRow> => ownEvent(db, userId, id);

export function createEvent(db: Db, userId: string, input: EventFields): Promise<repo.EventRow> {
  return db.transaction(async (tx) => {
    await requireWritableCalendar(tx, userId, input.calendarId);
    const row = await repo.insertEvent(tx, {
      ownerUserId: userId,
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
    });
    await reexpand(tx, row.id);
    await enqueueOps(tx, userId, opsForCreate(row));
    return ownEvent(tx, userId, row.id);
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
): Promise<repo.EventRow> {
  return db.transaction(async (tx) => {
    const e = await writableEvent(tx, userId, id);
    if (patch.calendarId) await requireWritableCalendar(tx, userId, patch.calendarId);
    const plan = planChange(e, patch, scope, recurrenceId);
    const calendarId = patch.calendarId ?? e.calendarId;

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
        await enqueueOps(tx, userId, opsForChange(e, plan, { calendarId }));
        return ownEvent(tx, userId, id);
      }
      case 'occurrence': {
        const existing = await repo.findOverride(tx, id, plan.recurrenceId);
        await repo.upsertOverride(tx, id, plan.recurrenceId, overrideValues(e, existing, patch, plan.recurrenceId));
        await reexpand(tx, id);
        await enqueueOps(tx, userId, opsForChange(e, plan, { calendarId }));
        return ownEvent(tx, userId, id);
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
        await reexpand(tx, id);
        await reexpand(tx, created.id);
        await enqueueOps(tx, userId, opsForChange(e, plan, { calendarId, created }));
        return ownEvent(tx, userId, created.id);
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
    const e = await writableEvent(tx, userId, id);
    const plan = planDelete(e, scope, recurrenceId);
    await enqueueOps(tx, userId, opsForDelete(e, plan));
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
