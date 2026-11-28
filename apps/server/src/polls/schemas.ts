// Request and response schemas for polls. See docs/design/phase-7-polls.md ("API").
import { POLL_LIMITS } from '@homa/core';
import { z } from '@hono/zod-openapi';
import { AVAILABILITY_LIMITS } from '@/calendar/schemas';
import { Tz } from '@/reminders';

const When = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const Hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'a time like 18:30');

export const Id = z.object({ id: z.uuid() });

const Person = z.object({ id: z.string(), name: z.string() });

export const PollSlot = z.object({ id: z.uuid(), start: z.iso.datetime(), end: z.iso.datetime() }).openapi('PollSlot');

export const PollParticipant = z
  .object({
    id: z.uuid().openapi({ description: 'The participant id answers and results refer to' }),
    userId: z.string(),
    name: z.string(),
    required: z.boolean(),
    responded: z.boolean(),
    holds: z.boolean(),
  })
  .openapi('PollParticipant');

export const PollAnswer = z
  .object({
    participantId: z.uuid(),
    ranked: z.array(z.uuid()).openapi({ description: 'Slot ids, best first' }),
    cannot: z.array(z.uuid()),
  })
  .openapi('PollAnswer');

export const PollResult = z
  .object({
    slotId: z.uuid(),
    points: z.int(),
    canMake: z.array(z.uuid()),
    cannot: z.array(z.uuid()),
    unranked: z.array(z.uuid()),
    eligible: z.boolean(),
    requiredCannot: z.array(z.uuid()).openapi({ description: "Required participants who can't make it" }),
    needed: z.int().openapi({ description: 'People needed (the quorum, or everyone)' }),
  })
  .openapi('PollResult');

export const PollStatus = z.enum(['draft', 'open', 'closed', 'finalized', 'cancelled']);

export const Poll = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    durationMinutes: z.int(),
    tz: z.string(),
    status: PollStatus,
    deadline: z.iso.datetime().nullable(),
    quorum: z.int().nullable(),
    holds: z.boolean(),
    calendarId: z.uuid().nullable(),
    finalSlotId: z.uuid().nullable(),
    organizer: Person,
    slots: z.array(PollSlot),
    participants: z.array(PollParticipant),
    answers: z.array(PollAnswer),
    results: z.array(PollResult).openapi({ description: 'Best first' }),
    busy: z
      .array(z.object({ participantId: z.uuid(), slotIds: z.array(z.uuid()) }))
      .nullable()
      .openapi({
        description:
          'For the organizer: slots that clash with each person’s busy time, as far as the organizer can see',
      }),
    me: z.object({ participantId: z.uuid().nullable(), organizer: z.boolean() }),
    createdAt: z.iso.datetime(),
  })
  .openapi('Poll');

export const PollSummary = z
  .object({
    id: z.uuid(),
    title: z.string(),
    status: PollStatus,
    deadline: z.iso.datetime().nullable(),
    organizer: Person,
    slots: z.int(),
    participants: z.int(),
    responded: z.int(),
    meResponded: z.boolean().openapi({ description: 'Whether you answered (false for the organizer who has not)' }),
    organizing: z.boolean(),
    finalStart: z.iso.datetime().nullable(),
  })
  .openapi('PollSummary');

export const PollListQuery = z.object({ view: z.enum(['mine', 'answer', 'past']).default('mine') });

const PersonInput = z.object({ userId: z.string().min(1), required: z.boolean().default(false) });

const PollFields = z.object({
  title: z.string().trim().min(1).max(POLL_LIMITS.title),
  description: z.string().max(POLL_LIMITS.description).nullable().default(null),
  location: z.string().max(POLL_LIMITS.location).nullable().default(null),
  durationMinutes: z.int().min(POLL_LIMITS.minMinutes).max(POLL_LIMITS.maxMinutes),
  tz: Tz,
  slots: z.array(When).max(POLL_LIMITS.slots).openapi({ description: 'Slot starts; each lasts durationMinutes' }),
  people: z
    .array(PersonInput)
    .max(POLL_LIMITS.participants)
    .openapi({ description: 'Everyone but you; you are always in, and required' }),
  deadline: When.nullable().default(null),
  quorum: z.int().min(1).nullable().default(null),
  holds: z.boolean().default(false),
  calendarId: z.uuid().nullable().default(null),
});

export const PollInput = PollFields.openapi('PollInput');
export const PollPatch = PollFields.partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to change')
  .openapi('PollPatch');

export const AnswerInput = z
  .object({
    ranked: z.array(z.uuid()).max(POLL_LIMITS.slots),
    cannot: z.array(z.uuid()).max(POLL_LIMITS.slots),
    holds: z.boolean().default(false),
  })
  .openapi('PollAnswerInput');

export const FinalizeInput = z.object({ slotId: z.uuid(), calendarId: z.uuid() }).openapi('PollFinalizeInput');
export const ReopenInput = z.object({ deadline: When.nullable() }).openapi('PollReopenInput');

export const SuggestInput = z
  .object({
    from: When,
    to: When,
    durationMinutes: z.int().min(POLL_LIMITS.minMinutes).max(POLL_LIMITS.maxMinutes),
    tz: Tz,
    people: z.array(PersonInput).max(AVAILABILITY_LIMITS.maxPeople - 1),
    days: z.enum(['any', 'weekdays', 'weekends']).default('any'),
    between: z.object({ from: Hhmm, to: Hhmm }).nullable().default(null),
  })
  .refine((q) => q.to > q.from, { message: 'to must be after from', path: ['to'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= AVAILABILITY_LIMITS.maxRangeDays * 86_400_000, {
    message: `the range can be at most ${AVAILABILITY_LIMITS.maxRangeDays} days`,
    path: ['to'],
  })
  .openapi('PollSuggestInput');

export const Suggestion = z
  .object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    busy: z.array(z.string()).openapi({ description: 'User ids busy then' }),
  })
  .openapi('PollSuggestion');

export const Prefill = z.object({ cannot: z.array(z.uuid()) }).openapi('PollPrefill');

export const HoldQuery = z.object({ from: When, to: When });
export const Hold = z
  .object({ pollId: z.uuid(), title: z.string(), start: z.iso.datetime(), end: z.iso.datetime() })
  .openapi('Hold');
