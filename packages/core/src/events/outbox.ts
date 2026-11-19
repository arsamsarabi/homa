// Which remote resources a local change touches, for calendars synced two ways (CalDAV). Each
// event is one remote resource holding the series and its overrides, so every change is either
// "upload this event's current state" or "delete this resource". The caller keeps only the ops
// whose calendar syncs, and writes them to the outbox in the same transaction as the change.
import type { ChangePlan, DeletePlan } from './changes';

export type OutboxPut = { kind: 'put'; calendarId: string; eventId: string; uid: string };
/** `href` and `etag` are the remote state last seen; a delete only happens if the server still has it. */
export type OutboxDelete = {
  kind: 'delete';
  calendarId: string;
  uid: string;
  href: string | null;
  etag: string | null;
};
export type OutboxOp = OutboxPut | OutboxDelete;

/** What the planner needs of a stored event. */
export type SyncedEvent = {
  id: string;
  calendarId: string;
  uid: string;
  remoteHref: string | null;
  remoteEtag: string | null;
};

const put = (e: { id: string; calendarId: string; uid: string }): OutboxPut => ({
  kind: 'put',
  calendarId: e.calendarId,
  eventId: e.id,
  uid: e.uid,
});

const remove = (e: SyncedEvent): OutboxDelete => ({
  kind: 'delete',
  calendarId: e.calendarId,
  uid: e.uid,
  href: e.remoteHref,
  etag: e.remoteEtag,
});

export const opsForCreate = (created: { id: string; calendarId: string; uid: string }): OutboxOp[] => [put(created)];

/**
 * Ops for a change planned by `planChange`. `calendarId` is where the event (or, for a split, the
 * new series) ends up; `created` is the new series of a split.
 */
export function opsForChange(
  before: SyncedEvent,
  plan: ChangePlan,
  after: { calendarId: string; created?: { id: string; uid: string } },
): OutboxOp[] {
  switch (plan.kind) {
    case 'series':
      // Moving to another calendar deletes the old resource and creates one in the new calendar.
      return after.calendarId === before.calendarId
        ? [put(before)]
        : [remove(before), put({ ...before, calendarId: after.calendarId })];
    case 'occurrence':
      return [put(before)];
    case 'split':
      // The old series ends before the cut; the new one is a new resource with its own UID.
      if (!after.created) throw new Error('a split needs the new series');
      return [put(before), put({ ...after.created, calendarId: after.calendarId })];
  }
}

/** Ops for a delete planned by `planDelete`: only deleting the whole event removes the resource. */
export const opsForDelete = (before: SyncedEvent, plan: DeletePlan): OutboxOp[] =>
  plan.kind === 'event' ? [remove(before)] : [put(before)];
