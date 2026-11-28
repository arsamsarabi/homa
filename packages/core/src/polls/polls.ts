// Polls: scoring ranked answers and suggesting slots from free/busy. Pure, so the server and the
// web app agree. See docs/design/phase-7-polls.md ("Scoring").
import type { Interval } from '../availability';

export const POLL_LIMITS = {
  title: 200,
  description: 5_000,
  location: 500,
  slots: 30,
  participants: 100,
  openPerOrganizer: 50,
  /** How far ahead a deadline can be. */
  deadlineDays: 180,
  /** Slots must sit within this many days of each other (the availability range). */
  spanDays: 92,
  minMinutes: 5,
  maxMinutes: 1440,
  suggestions: 10,
} as const;

/** One participant's answer: slot ids best first, and the ones they can't make. Anything else is unranked. */
export type Ballot = { participantId: string; required: boolean; ranked: readonly string[]; cannot: readonly string[] };

export type SlotResult = {
  slotId: string;
  points: number;
  /** Participants who ranked the slot. */
  canMake: string[];
  cannot: string[];
  unranked: string[];
  eligible: boolean;
  /** Why it isn't eligible: required people who can't, or too few who can. */
  reason: { requiredCannot: string[] } | { needed: number; have: number } | null;
};

/** Borda points: in a list of n ranked slots the first gets n, the next n − 1, and so on. */
export function points(ballots: readonly Ballot[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of ballots)
    for (const [i, slotId] of b.ranked.entries()) out.set(slotId, (out.get(slotId) ?? 0) + b.ranked.length - i);
  return out;
}

/**
 * Every slot's result, best first: eligible slots (no required person can't, and at least `quorum`
 * people ranked it, or everyone when null) by points, then by how many can make it, then the earlier
 * start; ineligible ones after, in the same order.
 */
export function rankSlots(
  slots: readonly { id: string; start: Date }[],
  ballots: readonly Ballot[],
  quorum: number | null,
): SlotResult[] {
  const score = points(ballots);
  const needed = quorum ?? ballots.length;
  const results = slots.map((s): SlotResult & { start: Date } => {
    const canMake = ballots.filter((b) => b.ranked.includes(s.id)).map((b) => b.participantId);
    const cannot = ballots.filter((b) => b.cannot.includes(s.id)).map((b) => b.participantId);
    const unranked = ballots
      .filter((b) => !b.ranked.includes(s.id) && !b.cannot.includes(s.id))
      .map((b) => b.participantId);
    const requiredCannot = ballots.filter((b) => b.required && b.cannot.includes(s.id)).map((b) => b.participantId);
    const reason = requiredCannot.length
      ? { requiredCannot }
      : canMake.length < needed
        ? { needed, have: canMake.length }
        : null;
    return {
      slotId: s.id,
      start: s.start,
      points: score.get(s.id) ?? 0,
      canMake,
      cannot,
      unranked,
      eligible: !reason,
      reason,
    };
  });
  results.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.points - a.points ||
      b.canMake.length - a.canMake.length ||
      a.start.getTime() - b.start.getTime(),
  );
  return results.map(({ start: _start, ...r }) => r);
}

/** The ballot's ranked slot ids with duplicates, unknown ids and "can't" ones taken out. */
export function cleanBallot(
  ranked: readonly string[],
  cannot: readonly string[],
  slotIds: ReadonlySet<string>,
): { ranked: string[]; cannot: string[] } {
  const no = new Set(cannot.filter((id) => slotIds.has(id)));
  const yes = [...new Set(ranked)].filter((id) => slotIds.has(id) && !no.has(id));
  return { ranked: yes, cannot: [...no] };
}

export type SuggestOptions = {
  from: Date;
  to: Date;
  durationMinutes: number;
  /** Each person's busy times, merged and sorted (as mergeBusy gives them). */
  busy: ReadonlyMap<string, readonly Interval[]>;
  /** People who must be free. */
  required: ReadonlySet<string>;
  /** The zone the day and time bounds are in. */
  tz: string;
  days?: 'any' | 'weekdays' | 'weekends';
  /** Local times "HH:MM": the slot must start and end inside them on one day. */
  between?: { from: string; to: string } | null;
  stepMinutes?: number;
  max?: number;
};

export type Suggestion = { start: Date; end: Date; free: string[]; busy: string[] };

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Up to `max` slots in [from, to) where every required person is free, the most others free
 * first (then the earliest), none overlapping another.
 */
export function suggestSlots(o: SuggestOptions): Suggestion[] {
  const step = (o.stepMinutes ?? 15) * 60_000;
  const length = o.durationMinutes * 60_000;
  const people = [...o.busy.keys()];
  const cursor = new Map(people.map((p) => [p, 0]));
  const lo = o.between ? minutesOf(o.between.from) : 0;
  const hi = o.between ? minutesOf(o.between.to) : 24 * 60;
  const found: Suggestion[] = [];

  for (let t = Math.ceil(o.from.getTime() / step) * step; t + length <= o.to.getTime(); t += step) {
    const local = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(o.tz);
    const weekend = local.dayOfWeek >= 6;
    if ((o.days === 'weekdays' && weekend) || (o.days === 'weekends' && !weekend)) continue;
    if (o.between) {
      // Ends by `to` on the day it starts (24:00 is the next midnight).
      const latest = local.toPlainDate().toPlainDateTime().add({ minutes: hi });
      const end = Temporal.Instant.fromEpochMilliseconds(t + length)
        .toZonedDateTimeISO(o.tz)
        .toPlainDateTime();
      if (local.hour * 60 + local.minute < lo || Temporal.PlainDateTime.compare(end, latest) > 0) continue;
    }

    const free: string[] = [];
    const busyNow: string[] = [];
    for (const p of people) {
      const list = o.busy.get(p) ?? [];
      let i = cursor.get(p) ?? 0;
      while (i < list.length && (list[i] as Interval).end.getTime() <= t) i++;
      cursor.set(p, i);
      const next = list[i];
      if (next && next.start.getTime() < t + length) busyNow.push(p);
      else free.push(p);
    }
    if (busyNow.some((p) => o.required.has(p))) continue;
    found.push({ start: new Date(t), end: new Date(t + length), free, busy: busyNow });
  }

  found.sort((a, b) => b.free.length - a.free.length || a.start.getTime() - b.start.getTime());
  const picked: Suggestion[] = [];
  for (const s of found) {
    if (picked.length >= (o.max ?? POLL_LIMITS.suggestions)) break;
    if (picked.every((p) => s.end <= p.start || s.start >= p.end)) picked.push(s);
  }
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
}
