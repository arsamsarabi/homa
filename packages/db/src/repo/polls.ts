// Polls, their slots, participants, answers and the events they made. Access checks live in the
// service: these functions trust the ids they get.
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { pollAnswers, pollEvents, pollParticipants, pollSlots, polls, users } from '../schema';

export type PollRow = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PollColumns = Partial<Omit<NewPoll, 'id' | 'organizerUserId' | 'createdAt' | 'updatedAt'>>;
export type PollSlotRow = typeof pollSlots.$inferSelect;
export type PollParticipantRow = typeof pollParticipants.$inferSelect & { name: string; email: string };
export type PollAnswerRow = typeof pollAnswers.$inferSelect;
export type PollEventRow = typeof pollEvents.$inferSelect;

export async function insertPoll(db: Executor, values: NewPoll): Promise<PollRow> {
  const [row] = await db.insert(polls).values(values).returning();
  if (!row) throw new Error('insert returned no poll');
  return row;
}

export async function findPoll(db: Executor, id: string): Promise<PollRow | undefined> {
  const [row] = await db.select().from(polls).where(eq(polls.id, id));
  return row;
}

/** The poll, locked for update: status changes and answers run one at a time per poll. */
export async function lockPoll(db: Executor, id: string): Promise<PollRow | undefined> {
  const [row] = await db.select().from(polls).where(eq(polls.id, id)).for('update');
  return row;
}

export async function updatePoll(db: Executor, id: string, columns: PollColumns): Promise<void> {
  await db.update(polls).set(columns).where(eq(polls.id, id));
}

export async function deletePoll(db: Executor, id: string): Promise<void> {
  await db.delete(polls).where(eq(polls.id, id));
}

export async function countOpenPolls(db: Executor, organizerUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(polls)
    .where(and(eq(polls.organizerUserId, organizerUserId), inArray(polls.status, ['draft', 'open', 'closed'])));
  return row?.n ?? 0;
}

/** Polls the user organizes or takes part in, newest first. */
export async function listPollsFor(db: Executor, userId: string): Promise<PollRow[]> {
  const mine = db
    .select({ id: pollParticipants.pollId })
    .from(pollParticipants)
    .where(eq(pollParticipants.userId, userId));
  return db
    .select()
    .from(polls)
    .where(or(eq(polls.organizerUserId, userId), inArray(polls.id, mine)))
    .orderBy(desc(polls.createdAt));
}

export const listSlots = (db: Executor, pollIds: readonly string[]): Promise<PollSlotRow[]> =>
  pollIds.length
    ? db
        .select()
        .from(pollSlots)
        .where(inArray(pollSlots.pollId, [...pollIds]))
        .orderBy(asc(pollSlots.startAt))
    : Promise.resolve([]);

/** Makes the poll's slots exactly `wanted`: keeps those with the same start, removes the rest (and their answers). */
export async function setSlots(
  db: Executor,
  pollId: string,
  wanted: readonly { start: Date; end: Date }[],
): Promise<void> {
  const starts = wanted.map((w) => w.start);
  await db
    .delete(pollSlots)
    .where(and(eq(pollSlots.pollId, pollId), starts.length ? notInArray(pollSlots.startAt, starts) : undefined));
  if (wanted.length)
    await db
      .insert(pollSlots)
      .values(wanted.map((w) => ({ pollId, startAt: w.start, endAt: w.end })))
      .onConflictDoUpdate({ target: [pollSlots.pollId, pollSlots.startAt], set: { endAt: sql`excluded.end_at` } });
}

export const listParticipants = (db: Executor, pollIds: readonly string[]): Promise<PollParticipantRow[]> =>
  pollIds.length
    ? db
        .select({
          id: pollParticipants.id,
          pollId: pollParticipants.pollId,
          userId: pollParticipants.userId,
          required: pollParticipants.required,
          holds: pollParticipants.holds,
          respondedAt: pollParticipants.respondedAt,
          name: users.name,
          email: users.email,
        })
        .from(pollParticipants)
        .innerJoin(users, eq(users.id, pollParticipants.userId))
        .where(inArray(pollParticipants.pollId, [...pollIds]))
        .orderBy(asc(users.name))
    : Promise.resolve([]);

/** Makes the poll's participants exactly `wanted`, keeping the answers of those who stay. */
export async function setParticipants(
  db: Executor,
  pollId: string,
  wanted: readonly { userId: string; required: boolean }[],
): Promise<void> {
  const ids = wanted.map((w) => w.userId);
  await db
    .delete(pollParticipants)
    .where(and(eq(pollParticipants.pollId, pollId), ids.length ? notInArray(pollParticipants.userId, ids) : undefined));
  if (wanted.length)
    await db
      .insert(pollParticipants)
      .values(wanted.map((w) => ({ pollId, userId: w.userId, required: w.required })))
      .onConflictDoUpdate({
        target: [pollParticipants.pollId, pollParticipants.userId],
        set: { required: sql`excluded.required` },
      });
}

export async function findParticipant(
  db: Executor,
  pollId: string,
  userId: string,
): Promise<typeof pollParticipants.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(pollParticipants)
    .where(and(eq(pollParticipants.pollId, pollId), eq(pollParticipants.userId, userId)));
  return row;
}

export const listAnswers = (db: Executor, pollIds: readonly string[]): Promise<PollAnswerRow[]> =>
  pollIds.length
    ? db
        .select({ participantId: pollAnswers.participantId, slotId: pollAnswers.slotId, rank: pollAnswers.rank })
        .from(pollAnswers)
        .innerJoin(pollParticipants, eq(pollParticipants.id, pollAnswers.participantId))
        .where(inArray(pollParticipants.pollId, [...pollIds]))
    : Promise.resolve([]);

/** Replaces one participant's answers and marks them as having answered. */
export async function replaceAnswers(
  db: Executor,
  participantId: string,
  answer: { ranked: readonly string[]; cannot: readonly string[]; holds: boolean },
  now: Date,
): Promise<void> {
  await db.delete(pollAnswers).where(eq(pollAnswers.participantId, participantId));
  const rows = [
    ...answer.ranked.map((slotId, i) => ({ participantId, slotId, rank: i + 1 })),
    ...answer.cannot.map((slotId) => ({ participantId, slotId, rank: null })),
  ];
  if (rows.length) await db.insert(pollAnswers).values(rows);
  await db
    .update(pollParticipants)
    .set({ respondedAt: now, holds: answer.holds })
    .where(eq(pollParticipants.id, participantId));
}

/** Open polls whose deadline has passed. */
export const listPollsToClose = (db: Executor, now: Date): Promise<PollRow[]> =>
  db
    .select()
    .from(polls)
    .where(and(eq(polls.status, 'open'), isNotNull(polls.deadline), lte(polls.deadline, now)));

/** Open polls whose deadline is within `withinMs` and whose "closes tomorrow" notice hasn't gone out. */
export const listPollsClosingSoon = (db: Executor, now: Date, withinMs: number): Promise<PollRow[]> =>
  db
    .select()
    .from(polls)
    .where(
      and(
        eq(polls.status, 'open'),
        isNull(polls.remindedAt),
        gt(polls.deadline, now),
        lte(polls.deadline, new Date(now.getTime() + withinMs)),
      ),
    );

export type HoldRow = { userId: string; pollId: string; title: string; start: Date; end: Date };

/**
 * Tentative holds of these users overlapping [from, to): every slot of an open poll they organize
 * with holds on, and the slots they ranked in open polls where their holds are on.
 */
export async function listHolds(db: Executor, userIds: readonly string[], from: Date, to: Date): Promise<HoldRow[]> {
  if (!userIds.length) return [];
  const inRange = and(lt(pollSlots.startAt, to), gt(pollSlots.endAt, from));
  const organized = await db
    .select({
      userId: polls.organizerUserId,
      pollId: polls.id,
      title: polls.title,
      start: pollSlots.startAt,
      end: pollSlots.endAt,
    })
    .from(polls)
    .innerJoin(pollSlots, eq(pollSlots.pollId, polls.id))
    .where(and(eq(polls.status, 'open'), eq(polls.holds, true), inArray(polls.organizerUserId, [...userIds]), inRange));
  const ranked = await db
    .select({
      userId: pollParticipants.userId,
      pollId: polls.id,
      title: polls.title,
      start: pollSlots.startAt,
      end: pollSlots.endAt,
    })
    .from(pollParticipants)
    .innerJoin(polls, eq(polls.id, pollParticipants.pollId))
    .innerJoin(pollAnswers, eq(pollAnswers.participantId, pollParticipants.id))
    .innerJoin(pollSlots, eq(pollSlots.id, pollAnswers.slotId))
    .where(
      and(
        eq(polls.status, 'open'),
        eq(pollParticipants.holds, true),
        isNotNull(pollAnswers.rank),
        inArray(pollParticipants.userId, [...userIds]),
        inRange,
      ),
    );
  // The organizer holding every slot and also ranking one would count it twice.
  const seen = new Set<string>();
  return [...organized, ...ranked].filter((h) => {
    const k = `${h.userId}|${h.pollId}|${h.start.getTime()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function insertPollEvents(db: Executor, rows: readonly (typeof pollEvents.$inferInsert)[]): Promise<void> {
  if (rows.length) await db.insert(pollEvents).values([...rows]);
}

export async function findPollEvent(db: Executor, eventId: string): Promise<PollEventRow | undefined> {
  const [row] = await db.select().from(pollEvents).where(eq(pollEvents.eventId, eventId));
  return row;
}

export const listPollEvents = (db: Executor, pollId: string): Promise<PollEventRow[]> =>
  db.select().from(pollEvents).where(eq(pollEvents.pollId, pollId));

/** The poll each of these events came from, by event id. */
export async function pollIdsByEvent(db: Executor, eventIds: readonly string[]): Promise<Map<string, string>> {
  if (!eventIds.length) return new Map();
  const rows = await db
    .select({ eventId: pollEvents.eventId, pollId: pollEvents.pollId })
    .from(pollEvents)
    .where(inArray(pollEvents.eventId, [...eventIds]));
  return new Map(rows.map((r) => [r.eventId, r.pollId]));
}
