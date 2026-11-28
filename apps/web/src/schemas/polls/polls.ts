// Runtime schemas for polls, as the API returns them.
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });
const Person = z.object({ id: z.string(), name: z.string() });

export const POLL_STATUSES = ['draft', 'open', 'closed', 'finalized', 'cancelled'] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

export const PollSlotSchema = z.object({ id: z.string(), start: isoDateTime, end: isoDateTime });
export type PollSlot = z.infer<typeof PollSlotSchema>;

export const PollParticipantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  required: z.boolean(),
  responded: z.boolean(),
  holds: z.boolean(),
});
export type PollParticipant = z.infer<typeof PollParticipantSchema>;

export const PollResultSchema = z.object({
  slotId: z.string(),
  points: z.number().int(),
  canMake: z.array(z.string()),
  cannot: z.array(z.string()),
  unranked: z.array(z.string()),
  eligible: z.boolean(),
  requiredCannot: z.array(z.string()),
  needed: z.number().int(),
});
export type PollResult = z.infer<typeof PollResultSchema>;

export const PollSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  durationMinutes: z.number().int(),
  tz: z.string(),
  status: z.enum(POLL_STATUSES),
  deadline: isoDateTime.nullable(),
  quorum: z.number().int().nullable(),
  holds: z.boolean(),
  calendarId: z.string().nullable(),
  finalSlotId: z.string().nullable(),
  organizer: Person,
  slots: z.array(PollSlotSchema),
  participants: z.array(PollParticipantSchema),
  answers: z.array(z.object({ participantId: z.string(), ranked: z.array(z.string()), cannot: z.array(z.string()) })),
  results: z.array(PollResultSchema),
  busy: z.array(z.object({ participantId: z.string(), slotIds: z.array(z.string()) })).nullable(),
  me: z.object({ participantId: z.string().nullable(), organizer: z.boolean() }),
  createdAt: isoDateTime,
});
export type Poll = z.infer<typeof PollSchema>;

export const PollSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(POLL_STATUSES),
  deadline: isoDateTime.nullable(),
  organizer: Person,
  slots: z.number().int(),
  participants: z.number().int(),
  responded: z.number().int(),
  meResponded: z.boolean(),
  organizing: z.boolean(),
  finalStart: isoDateTime.nullable(),
});
export type PollSummary = z.infer<typeof PollSummarySchema>;
export const PollSummaryListSchema = z.array(PollSummarySchema);

export const SuggestionSchema = z.object({ start: isoDateTime, end: isoDateTime, busy: z.array(z.string()) });
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const HoldSchema = z.object({ pollId: z.string(), title: z.string(), start: isoDateTime, end: isoDateTime });
export type Hold = z.infer<typeof HoldSchema>;

export const POLL_TABS = ['answer', 'mine', 'past'] as const;
export type PollTab = (typeof POLL_TABS)[number];
export const PollsSearchSchema = z.object({ tab: z.enum(POLL_TABS).optional().catch(undefined) });
