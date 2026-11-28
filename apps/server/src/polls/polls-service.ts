// Polls: drafts, opening, ranked answers, closing at the deadline, finalizing into events, and
// tentative holds. A poll is visible only to its organizer and participants (others get a 404),
// and only the organizer changes it. See docs/design/phase-7-polls.md.
import {
  type Ballot,
  cleanBallot,
  ForbiddenError,
  NotFoundError,
  POLL_LIMITS,
  rankSlots,
  suggestSlots,
  ValidationError,
} from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import { getAvailability } from '@/calendar/availability-service';
import { requireEditCalendar } from '@/calendar/calendars-service';
import { createEvent } from '@/calendar/events-service';
import { notifyPoll } from './notices';
import type { AnswerInput, PollInput, PollPatch, SuggestInput } from './schemas';

const DAY_MS = 86_400_000;
const MINUTE = 60_000;

type Fields = z.output<typeof PollInput>;
type Patch = z.output<typeof PollPatch>;

/** Everything a poll response needs. */
export type PollView = {
  poll: repo.PollRow;
  organizerName: string;
  slots: repo.PollSlotRow[];
  participants: repo.PollParticipantRow[];
  answers: { participantId: string; ranked: string[]; cannot: string[] }[];
  results: ReturnType<typeof rankSlots>;
  needed: number;
  busy: { participantId: string; slotIds: string[] }[] | null;
  me: { participantId: string | null; organizer: boolean };
};

const editable = (p: repo.PollRow): boolean => p.status === 'draft' || p.status === 'open' || p.status === 'closed';

/** The poll, if `userId` may see it: the organizer always, participants once it isn't a draft. */
async function visiblePoll(db: Executor, userId: string, id: string): Promise<repo.PollRow> {
  const p = await repo.findPoll(db, id);
  if (!p) throw new NotFoundError();
  if (p.organizerUserId === userId) return p;
  if (p.status === 'draft' || !(await repo.findParticipant(db, id, userId))) throw new NotFoundError();
  return p;
}

/** The poll, locked, if `userId` organizes it; participants get a 403, anyone else a 404. */
async function organizedPoll(db: Executor, userId: string, id: string): Promise<repo.PollRow> {
  const p = await repo.lockPoll(db, id);
  if (!p) throw new NotFoundError();
  if (p.organizerUserId !== userId) {
    await visiblePoll(db, userId, id);
    throw new ForbiddenError('Only the organizer can change the poll');
  }
  return p;
}

function checkSlots(starts: readonly Date[], durationMinutes: number): { start: Date; end: Date }[] {
  const unique = [...new Map(starts.map((s) => [s.getTime(), s])).values()].sort((a, b) => a.getTime() - b.getTime());
  const first = unique[0];
  const last = unique.at(-1);
  if (first && last && last.getTime() - first.getTime() > POLL_LIMITS.spanDays * DAY_MS)
    throw new ValidationError(`The times must be within ${POLL_LIMITS.spanDays} days of each other`);
  return unique.map((start) => ({ start, end: new Date(start.getTime() + durationMinutes * MINUTE) }));
}

function checkDeadline(deadline: Date | null | undefined, now: Date): void {
  if (!deadline) return;
  if (deadline <= now) throw new ValidationError('The deadline must be in the future');
  if (deadline.getTime() - now.getTime() > POLL_LIMITS.deadlineDays * DAY_MS)
    throw new ValidationError(`The deadline can be at most ${POLL_LIMITS.deadlineDays} days ahead`);
}

/** Everyone but the organizer, once each; the organizer is added as required. */
async function checkPeople(
  db: Executor,
  organizerId: string,
  people: readonly { userId: string; required: boolean }[],
): Promise<{ userId: string; required: boolean }[]> {
  const others = [...new Map(people.filter((p) => p.userId !== organizerId).map((p) => [p.userId, p])).values()];
  const found = await repo.existingUserIds(
    db,
    others.map((p) => p.userId),
  );
  if (others.some((p) => !found.has(p.userId))) throw new ValidationError('Unknown person');
  if (others.length + 1 > POLL_LIMITS.participants)
    throw new ValidationError(`A poll can have at most ${POLL_LIMITS.participants} people`);
  return [{ userId: organizerId, required: true }, ...others];
}

function checkQuorum(quorum: number | null | undefined, people: number): void {
  if (quorum != null && quorum > people) throw new ValidationError(`The poll has only ${people} people`);
}

export async function createPoll(db: Db, userId: string, f: Fields, now = new Date()): Promise<PollView> {
  const id = await db.transaction(async (tx) => {
    if ((await repo.countOpenPolls(tx, userId)) >= POLL_LIMITS.openPerOrganizer)
      throw new ValidationError(`You can have at most ${POLL_LIMITS.openPerOrganizer} polls going`);
    if (f.calendarId) await requireEditCalendar(tx, userId, f.calendarId);
    checkDeadline(f.deadline, now);
    const people = await checkPeople(tx, userId, f.people);
    checkQuorum(f.quorum, people.length);
    const poll = await repo.insertPoll(tx, {
      organizerUserId: userId,
      title: f.title,
      description: f.description,
      location: f.location,
      durationMinutes: f.durationMinutes,
      tz: f.tz,
      deadline: f.deadline,
      quorum: f.quorum,
      holds: f.holds,
      calendarId: f.calendarId,
    });
    await repo.setSlots(tx, poll.id, checkSlots(f.slots, f.durationMinutes));
    await repo.setParticipants(tx, poll.id, people);
    return poll.id;
  });
  return getPoll(db, userId, id);
}

export async function updatePoll(db: Db, userId: string, id: string, f: Patch, now = new Date()): Promise<PollView> {
  await db.transaction(async (tx) => {
    const p = await organizedPoll(tx, userId, id);
    if (!editable(p)) throw new ValidationError('A finished poll can’t change');
    if (f.durationMinutes !== undefined && f.durationMinutes !== p.durationMinutes && p.status !== 'draft')
      throw new ValidationError('The length can’t change once the poll is sent');
    if (f.calendarId) await requireEditCalendar(tx, userId, f.calendarId);
    if (f.deadline !== undefined) checkDeadline(f.deadline, now);
    const duration = f.durationMinutes ?? p.durationMinutes;
    const before = await repo.listParticipants(tx, [id]);
    let people = before.map((x) => ({ userId: x.userId, required: x.required }));
    if (f.people) {
      people = await checkPeople(tx, userId, f.people);
      await repo.setParticipants(tx, id, people);
    }
    checkQuorum(f.quorum === undefined ? p.quorum : f.quorum, people.length);
    if (f.slots) await repo.setSlots(tx, id, checkSlots(f.slots, duration));
    else if (f.durationMinutes !== undefined) {
      const slots = await repo.listSlots(tx, [id]);
      await repo.setSlots(
        tx,
        id,
        checkSlots(
          slots.map((s) => s.startAt),
          duration,
        ),
      );
    }
    await repo.updatePoll(tx, id, {
      ...(f.title !== undefined && { title: f.title }),
      ...(f.description !== undefined && { description: f.description }),
      ...(f.location !== undefined && { location: f.location }),
      ...(f.durationMinutes !== undefined && { durationMinutes: f.durationMinutes }),
      ...(f.tz !== undefined && { tz: f.tz }),
      ...(f.deadline !== undefined && { deadline: f.deadline, remindedAt: null }),
      ...(f.quorum !== undefined && { quorum: f.quorum }),
      ...(f.holds !== undefined && { holds: f.holds }),
      ...(f.calendarId !== undefined && { calendarId: f.calendarId }),
    });
    // People added to a poll that's already out hear about it.
    if (p.status === 'open') {
      const had = new Set(before.map((x) => x.userId));
      const added = people.map((x) => x.userId).filter((u) => !had.has(u));
      const organizer = (await repo.userNames(tx, [userId])).get(userId) ?? '';
      await notifyPoll(tx, { id, title: f.title ?? p.title }, 'opened', added, {
        at: p.deadline ?? now,
        key: 'added',
        organizer,
        now,
      });
    }
  });
  return getPoll(db, userId, id);
}

/** Deletes a draft or finished poll; cancels one that's out (and tells its people). */
export async function deletePoll(db: Db, userId: string, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await organizedPoll(tx, userId, id);
    if (p.status === 'open' || p.status === 'closed') {
      await repo.updatePoll(tx, id, { status: 'cancelled', closedAt: now });
      const people = (await repo.listParticipants(tx, [id])).map((x) => x.userId).filter((u) => u !== userId);
      await notifyPoll(tx, p, 'cancelled', people, { at: now, key: 'cancel', now });
      return;
    }
    await repo.deletePoll(tx, id);
  });
}

export async function openPoll(db: Db, userId: string, id: string, now = new Date()): Promise<PollView> {
  await db.transaction(async (tx) => {
    const p = await organizedPoll(tx, userId, id);
    if (p.status !== 'draft') throw new ValidationError('Only a draft can be sent');
    const [slots, people] = await Promise.all([repo.listSlots(tx, [id]), repo.listParticipants(tx, [id])]);
    if (slots.length < 2) throw new ValidationError('Add at least 2 times');
    const others = people.filter((x) => x.userId !== userId);
    if (!others.length) throw new ValidationError('Add at least one person');
    checkDeadline(p.deadline, now);
    await repo.updatePoll(tx, id, { status: 'open', openedAt: now });
    const organizer = (await repo.userNames(tx, [userId])).get(userId) ?? '';
    await notifyPoll(
      tx,
      p,
      'opened',
      others.map((x) => x.userId),
      { at: p.deadline ?? now, key: 'open', organizer, now },
    );
  });
  return getPoll(db, userId, id);
}

export async function closePoll(db: Db, userId: string, id: string, now = new Date()): Promise<PollView> {
  await db.transaction(async (tx) => {
    const p = await organizedPoll(tx, userId, id);
    if (p.status !== 'open') throw new ValidationError('The poll isn’t open');
    await repo.updatePoll(tx, id, { status: 'closed', closedAt: now });
  });
  return getPoll(db, userId, id);
}

export async function reopenPoll(
  db: Db,
  userId: string,
  id: string,
  deadline: Date | null,
  now = new Date(),
): Promise<PollView> {
  await db.transaction(async (tx) => {
    const p = await organizedPoll(tx, userId, id);
    if (p.status !== 'closed') throw new ValidationError('Only a closed poll can open again');
    checkDeadline(deadline, now);
    await repo.updatePoll(tx, id, { status: 'open', deadline, remindedAt: null, closedAt: null });
  });
  return getPoll(db, userId, id);
}

/** Replaces the caller's answer while the poll is open. */
export async function answerPoll(
  db: Db,
  userId: string,
  id: string,
  a: z.output<typeof AnswerInput>,
  now = new Date(),
): Promise<PollView> {
  await db.transaction(async (tx) => {
    const p = await repo.lockPoll(tx, id);
    if (!p) throw new NotFoundError();
    const me = await repo.findParticipant(tx, id, userId);
    if (!me || p.status === 'draft') throw new NotFoundError();
    if (p.status !== 'open') throw new ValidationError('Answers are closed');
    const slotIds = new Set((await repo.listSlots(tx, [id])).map((s) => s.id));
    await repo.replaceAnswers(tx, me.id, { ...cleanBallot(a.ranked, a.cannot, slotIds), holds: a.holds }, now);
  });
  return getPoll(db, userId, id);
}

/** Slots that clash with the caller's own busy time: where their ballot starts them. */
export async function prefill(db: Db, userId: string, id: string): Promise<string[]> {
  await visiblePoll(db, userId, id);
  const slots = await repo.listSlots(db, [id]);
  return clashes(db, userId, [userId], slots, id).then((m) => m.get(userId) ?? []);
}

/**
 * For each person, the slots that overlap their busy time as `viewerId` may see it. The poll's own
 * holds don't count against it.
 */
async function clashes(
  db: Db,
  viewerId: string,
  userIds: readonly string[],
  slots: readonly repo.PollSlotRow[],
  pollId: string,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const first = slots[0];
  const last = slots.at(-1);
  if (!first || !last || !userIds.length) return out;
  const from = first.startAt;
  const to = new Date(Math.max(...slots.map((s) => s.endAt.getTime())));
  const a = await getAvailability(db, viewerId, { from, to, userIds, exceptPollId: pollId });
  for (const person of a.people) {
    if (!person.shared) continue;
    out.set(
      person.userId,
      slots.filter((s) => person.busy.some((b) => b.start < s.endAt && b.end > s.startAt)).map((s) => s.id),
    );
  }
  return out;
}

export async function getPoll(db: Db, userId: string, id: string): Promise<PollView> {
  const poll = await visiblePoll(db, userId, id);
  const [slots, participants, answerRows, names] = await Promise.all([
    repo.listSlots(db, [id]),
    repo.listParticipants(db, [id]),
    repo.listAnswers(db, [id]),
    repo.userNames(db, [poll.organizerUserId]),
  ]);
  const answers = participants.map((x) => {
    const mine = answerRows.filter((r) => r.participantId === x.id);
    return {
      participantId: x.id,
      ranked: mine
        .filter((r) => r.rank !== null)
        .sort((l, r) => (l.rank ?? 0) - (r.rank ?? 0))
        .map((r) => r.slotId),
      cannot: mine.filter((r) => r.rank === null).map((r) => r.slotId),
    };
  });
  const ballots: Ballot[] = answers.map((a) => ({
    ...a,
    required: participants.find((x) => x.id === a.participantId)?.required ?? false,
  }));
  const results = rankSlots(
    slots.map((s) => ({ id: s.id, start: s.startAt })),
    ballots,
    poll.quorum,
  );
  const organizer = poll.organizerUserId === userId;
  let busy: PollView['busy'] = null;
  if (organizer && (poll.status === 'draft' || poll.status === 'open')) {
    const waiting = participants.filter((x) => !x.respondedAt);
    const byUser = await clashes(
      db,
      userId,
      waiting.map((x) => x.userId),
      slots,
      id,
    );
    busy = waiting.map((x) => ({ participantId: x.id, slotIds: byUser.get(x.userId) ?? [] }));
  }
  return {
    poll,
    organizerName: names.get(poll.organizerUserId) ?? '',
    slots,
    participants,
    answers,
    results,
    needed: poll.quorum ?? participants.length,
    busy,
    me: { participantId: participants.find((x) => x.userId === userId)?.id ?? null, organizer },
  };
}

export type PollSummaryView = {
  poll: repo.PollRow;
  organizerName: string;
  slots: number;
  participants: number;
  responded: number;
  meResponded: boolean;
  finalStart: Date | null;
};

/** mine: polls you organize that aren't finished; answer: open polls you're in; past: finished ones. */
export async function listPolls(db: Db, userId: string, view: 'mine' | 'answer' | 'past'): Promise<PollSummaryView[]> {
  const all = (await repo.listPollsFor(db, userId)).filter((p) => p.organizerUserId === userId || p.status !== 'draft');
  const chosen = all.filter((p) =>
    view === 'mine'
      ? p.organizerUserId === userId && editable(p)
      : view === 'answer'
        ? p.organizerUserId !== userId && p.status === 'open'
        : p.status === 'finalized' ||
          p.status === 'cancelled' ||
          (p.organizerUserId !== userId && p.status === 'closed'),
  );
  const ids = chosen.map((p) => p.id);
  const [slots, participants, names] = await Promise.all([
    repo.listSlots(db, ids),
    repo.listParticipants(db, ids),
    repo.userNames(db, [...new Set(chosen.map((p) => p.organizerUserId))]),
  ]);
  return chosen.map((p) => {
    const people = participants.filter((x) => x.pollId === p.id);
    return {
      poll: p,
      organizerName: names.get(p.organizerUserId) ?? '',
      slots: slots.filter((s) => s.pollId === p.id).length,
      participants: people.length,
      responded: people.filter((x) => x.respondedAt).length,
      meResponded: Boolean(people.find((x) => x.userId === userId)?.respondedAt),
      finalStart: slots.find((s) => s.id === p.finalSlotId)?.startAt ?? null,
    };
  });
}

/** Up to 10 slots where the required people are free, as far as the caller can see. */
export async function suggest(
  db: Db,
  userId: string,
  q: z.output<typeof SuggestInput>,
): Promise<{ start: Date; end: Date; busy: string[] }[]> {
  const people = [{ userId, required: true }, ...q.people.filter((p) => p.userId !== userId)];
  const a = await getAvailability(db, userId, {
    from: q.from,
    to: q.to,
    userIds: people.map((p) => p.userId),
  });
  const busy = new Map(a.people.filter((p) => p.shared).map((p) => [p.userId, p.busy]));
  return suggestSlots({
    from: q.from,
    to: q.to,
    durationMinutes: q.durationMinutes,
    busy,
    required: new Set(people.filter((p) => p.required).map((p) => p.userId)),
    tz: q.tz,
    days: q.days,
    between: q.between,
  }).map((s) => ({ start: s.start, end: s.end, busy: s.busy }));
}

/** The first Homa calendar a person owns that takes writes: where a poll's copy goes. */
async function copyCalendar(db: Executor, userId: string): Promise<repo.CalendarRow | undefined> {
  return (await repo.listCalendars(db, userId)).find((c) => !c.connectionId && !c.readOnly);
}

/**
 * Sets the poll's time: the organizer's event in `calendarId`, a copy for each other participant
 * who ranked the slot, and a notice to everyone.
 */
export async function finalizePoll(
  db: Db,
  userId: string,
  id: string,
  input: { slotId: string; calendarId: string },
  now = new Date(),
): Promise<PollView> {
  const { poll, slot } = await db.transaction(async (tx) => {
    const p = await organizedPoll(tx, userId, id);
    if (p.status !== 'open' && p.status !== 'closed')
      throw new ValidationError('Only an open or closed poll can be set');
    const s = (await repo.listSlots(tx, [id])).find((x) => x.id === input.slotId);
    if (!s) throw new ValidationError('Unknown time');
    await requireEditCalendar(tx, userId, input.calendarId);
    // Marked first, under the lock, so two clicks can't make two sets of events.
    await repo.updatePoll(tx, id, {
      status: 'finalized',
      finalSlotId: s.id,
      calendarId: input.calendarId,
      finalizedAt: now,
    });
    return { poll: p, slot: s };
  });

  const fields = {
    summary: poll.title,
    description: poll.description,
    location: poll.location,
    start: slot.startAt,
    end: slot.endAt,
    allDay: false,
    tz: poll.tz,
    rrule: null,
  };
  let made: { eventId: string; userId: string; organizer: boolean }[];
  try {
    const own = await createEvent(db, userId, { ...fields, calendarId: input.calendarId });
    made = [{ eventId: own.id, userId, organizer: true }];
  } catch (err) {
    await repo.updatePoll(db, id, { status: poll.status, finalSlotId: null, finalizedAt: null });
    throw err;
  }

  const [participants, answers] = await Promise.all([repo.listParticipants(db, [id]), repo.listAnswers(db, [id])]);
  const coming = new Set(answers.filter((a) => a.slotId === slot.id && a.rank !== null).map((a) => a.participantId));
  for (const x of participants) {
    if (x.userId === userId || !coming.has(x.id)) continue;
    const calendar = await copyCalendar(db, x.userId);
    if (!calendar) continue;
    const copy = await createEvent(db, x.userId, { ...fields, calendarId: calendar.id });
    made.push({ eventId: copy.id, userId: x.userId, organizer: false });
  }
  await repo.insertPollEvents(
    db,
    made.map((m) => ({ ...m, pollId: id })),
  );
  await notifyPoll(
    db,
    poll,
    'finalized',
    participants.map((x) => x.userId).filter((u) => u !== userId),
    { at: slot.startAt, key: 'final', now },
  );
  return getPoll(db, userId, id);
}

/** The caller's tentative holds overlapping [from, to). */
export const listHolds = (db: Db, userId: string, from: Date, to: Date): Promise<repo.HoldRow[]> =>
  repo.listHolds(db, [userId], from, to);

/**
 * The polls job: closes open polls past their deadline (telling the organizer), and tells people
 * who haven't answered that answers close within a day.
 */
export async function closeDuePolls(db: Db, now = new Date()): Promise<{ closed: number; reminded: number }> {
  let closed = 0;
  for (const p of await repo.listPollsToClose(db, now)) {
    await db.transaction(async (tx) => {
      const locked = await repo.lockPoll(tx, p.id);
      if (locked?.status !== 'open') return;
      await repo.updatePoll(tx, p.id, { status: 'closed', closedAt: now });
      await notifyPoll(tx, p, 'closed', [p.organizerUserId], {
        at: p.deadline ?? now,
        key: String(p.deadline?.getTime()),
        now,
      });
      closed++;
    });
  }
  let reminded = 0;
  for (const p of await repo.listPollsClosingSoon(db, now, DAY_MS)) {
    const waiting = (await repo.listParticipants(db, [p.id])).filter(
      (x) => !x.respondedAt && x.userId !== p.organizerUserId,
    );
    await notifyPoll(
      db,
      p,
      'closing',
      waiting.map((x) => x.userId),
      { at: p.deadline ?? now, key: String(p.deadline?.getTime()), now },
    );
    await repo.updatePoll(db, p.id, { remindedAt: now });
    reminded++;
  }
  return { closed, reminded };
}
