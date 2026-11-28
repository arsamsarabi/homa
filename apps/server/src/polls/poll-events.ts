// The events a finalized poll made: what the poll decided (time and place) can't change on them,
// and the copies follow the organizer's title and description.
import { type EventPatch, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { notifyPoll } from './notices';

/** Throws when a patch to a poll's event changes what the poll decided: its time and place. */
export async function assertPollPatch(
  db: Executor,
  e: repo.EventRow,
  patch: EventPatch,
): Promise<repo.PollEventRow | undefined> {
  const link = await repo.findPollEvent(db, e.id);
  if (!link) return undefined;
  const moved =
    (patch.start !== undefined && patch.start.getTime() !== e.startAt.getTime()) ||
    (patch.end !== undefined && patch.end.getTime() !== e.endAt.getTime()) ||
    (patch.allDay !== undefined && patch.allDay !== e.allDay) ||
    (patch.tz !== undefined && patch.tz !== e.tz) ||
    (patch.rrule !== undefined && patch.rrule !== e.rrule) ||
    (patch.location !== undefined && (patch.location || null) !== (e.location || null));
  if (moved) throw new ValidationError('Set by the poll: its time and place can’t change');
  return link;
}

/**
 * After the organizer's poll event changed title or description: copies follow, and a new title is
 * announced. Copies are updated directly (they live in Homa calendars and decided nothing).
 */
export async function followOrganizer(
  db: Db,
  link: repo.PollEventRow,
  before: { summary: string; description: string | null },
  after: { summary: string; description: string | null },
  now = new Date(),
): Promise<void> {
  if (!link.organizer || (before.summary === after.summary && before.description === after.description)) return;
  const copies = (await repo.listPollEvents(db, link.pollId)).filter((x) => !x.organizer);
  for (const c of copies)
    await repo.updateEventColumns(db, c.eventId, { summary: after.summary, description: after.description });
  if (before.summary !== after.summary) {
    const poll = await repo.findPoll(db, link.pollId);
    if (poll)
      await notifyPoll(
        db,
        { id: poll.id, title: after.summary },
        'renamed',
        copies.map((c) => c.userId),
        { at: now, key: now.toISOString(), old: before.summary, now },
      );
  }
}
