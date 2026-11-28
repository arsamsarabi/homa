// A poll's rules on the web: how a slot reads, and how a ballot's three groups change.
import type { Poll } from '@/schemas';

/** A slot as "Fri 5 Dec, 19:00 – 20:30" in `tz`. */
export function slotLabel(start: string, end: string, locale: string, tz: string): string {
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: tz });
  return `${day.format(new Date(start))}, ${time.format(new Date(start))} – ${time.format(new Date(end))}`;
}

/** A ballot in three groups: ranked best first, not ranked yet, and can't make it. */
export type Ballot = { ranked: string[]; unranked: string[]; cannot: string[] };

/** Your saved answer, or, before you've answered, the clashing slots under can't and the rest unranked. */
export function startBallot(poll: Poll, prefill: readonly string[] = []): Ballot {
  const all = poll.slots.map((s) => s.id);
  const saved = poll.answers.find((a) => a.participantId === poll.me.participantId);
  const responded = poll.participants.find((p) => p.id === poll.me.participantId)?.responded;
  const ranked = responded ? (saved?.ranked ?? []) : [];
  const cannot = responded ? (saved?.cannot ?? []) : all.filter((id) => prefill.includes(id));
  return { ranked, cannot, unranked: all.filter((id) => !ranked.includes(id) && !cannot.includes(id)) };
}

const without = (b: Ballot, id: string): Ballot => ({
  ranked: b.ranked.filter((x) => x !== id),
  unranked: b.unranked.filter((x) => x !== id),
  cannot: b.cannot.filter((x) => x !== id),
});

/** Adds a slot to the end of the order. */
export const rank = (b: Ballot, id: string): Ballot => {
  const r = without(b, id);
  return { ...r, ranked: [...r.ranked, id] };
};

/** Moves a slot under "Can't make it". */
export const cannot = (b: Ballot, id: string): Ballot => {
  const r = without(b, id);
  return { ...r, cannot: [...r.cannot, id] };
};

/** Back to "Not ranked yet". */
export const unrank = (b: Ballot, id: string): Ballot => {
  const r = without(b, id);
  return { ...r, unranked: [...r.unranked, id] };
};

/** Moves a ranked slot one place up (-1) or down (+1); at either end nothing changes. */
export function move(b: Ballot, id: string, by: -1 | 1): Ballot {
  const i = b.ranked.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= b.ranked.length) return b;
  const ranked = [...b.ranked];
  [ranked[i], ranked[j]] = [ranked[j] as string, ranked[i] as string];
  return { ...b, ranked };
}
