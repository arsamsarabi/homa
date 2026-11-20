// Queues local changes for calendars that sync two ways (CalDAV, Google), inside the transaction of the
// change, so a write and its outbox op commit together. Native calendars (no connection) and
// read-only ones (ICS feeds have no remote id) are left out. The sync worker pushes the ops.
import type { OutboxOp } from '@homa/core';
import { type Executor, repo } from '@homa/db';

/** True for a calendar whose local changes go back to its provider. */
export const syncsBack = (c: repo.CalendarRow): c is repo.CalendarRow & { connectionId: string; remoteId: string } =>
  c.connectionId !== null && c.remoteId !== null && !c.readOnly;

export async function enqueueOps(tx: Executor, userId: string, ops: readonly OutboxOp[]): Promise<void> {
  for (const op of ops) {
    const calendar = await repo.findOwnedCalendar(tx, userId, op.calendarId);
    if (!calendar || !syncsBack(calendar)) continue;
    if (op.kind === 'put')
      await repo.enqueueOutbox(tx, {
        connectionId: calendar.connectionId,
        calendarId: op.calendarId,
        uid: op.uid,
        kind: 'put',
        eventId: op.eventId,
        href: null,
        etag: null,
      });
    // Never uploaded: nothing on the server to delete, only a pending upload to cancel.
    else if (!op.href) await repo.dropOutbox(tx, op.calendarId, [op.uid]);
    else
      await repo.enqueueOutbox(tx, {
        connectionId: calendar.connectionId,
        calendarId: op.calendarId,
        uid: op.uid,
        kind: 'delete',
        eventId: null,
        href: op.href,
        etag: op.etag,
      });
  }
}
