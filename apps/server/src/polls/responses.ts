// Poll views to API responses.
import type { repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import type { PollSummaryView, PollView } from './polls-service';
import type { Hold, Poll, PollSummary } from './schemas';

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

export const pollOut = (v: PollView): z.infer<typeof Poll> => ({
  id: v.poll.id,
  title: v.poll.title,
  description: v.poll.description,
  location: v.poll.location,
  durationMinutes: v.poll.durationMinutes,
  tz: v.poll.tz,
  status: v.poll.status,
  deadline: iso(v.poll.deadline),
  quorum: v.poll.quorum,
  holds: v.poll.holds,
  calendarId: v.me.organizer ? v.poll.calendarId : null,
  finalSlotId: v.poll.finalSlotId,
  organizer: { id: v.poll.organizerUserId, name: v.organizerName },
  slots: v.slots.map((s) => ({ id: s.id, start: s.startAt.toISOString(), end: s.endAt.toISOString() })),
  participants: v.participants.map((x) => ({
    id: x.id,
    userId: x.userId,
    name: x.name,
    required: x.required,
    responded: x.respondedAt !== null,
    holds: x.holds,
  })),
  answers: v.answers,
  results: v.results.map((r) => ({
    slotId: r.slotId,
    points: r.points,
    canMake: r.canMake,
    cannot: r.cannot,
    unranked: r.unranked,
    eligible: r.eligible,
    requiredCannot: r.reason && 'requiredCannot' in r.reason ? r.reason.requiredCannot : [],
    needed: v.needed,
  })),
  busy: v.busy,
  me: v.me,
  createdAt: v.poll.createdAt.toISOString(),
});

export const pollSummaryOut = (v: PollSummaryView, userId: string): z.infer<typeof PollSummary> => ({
  id: v.poll.id,
  title: v.poll.title,
  status: v.poll.status,
  deadline: iso(v.poll.deadline),
  organizer: { id: v.poll.organizerUserId, name: v.organizerName },
  slots: v.slots,
  participants: v.participants,
  responded: v.responded,
  meResponded: v.meResponded,
  organizing: v.poll.organizerUserId === userId,
  finalStart: iso(v.finalStart),
});

export const holdOut = (h: repo.HoldRow): z.infer<typeof Hold> => ({
  pollId: h.pollId,
  title: h.title,
  start: h.start.toISOString(),
  end: h.end.toISOString(),
});
