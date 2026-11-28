// Runtime schemas for the calendar API's responses. The views rely on these shapes, so responses
// are parsed, not just cast: a server/client mismatch fails loudly at the fetch.
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const AccessLevelSchema = z.enum(['owner', 'freebusy', 'read', 'edit']);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const CalendarOwnerSchema = z.object({ id: z.string(), name: z.string() });
export type CalendarOwner = z.infer<typeof CalendarOwnerSchema>;

export const CalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  /** The connection it syncs with; null for the user's own calendars. */
  connectionId: z.string().nullable().default(null),
  /** Subscriptions: events can't be created, changed or deleted. */
  readOnly: z.boolean().default(false),
  /** Left out of the views; for a shared calendar this is the viewer's own choice. */
  hidden: z.boolean().default(false),
  /** Deleted at the source, or no longer shared with the account: the user can remove it. */
  remoteMissing: z.boolean().default(false),
  /** Effective access for the caller. */
  access: AccessLevelSchema,
  owner: CalendarOwnerSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Calendar = z.infer<typeof CalendarSchema>;
export const CalendarListSchema = z.array(CalendarSchema);

export const GrantLevelSchema = z.enum(['none', 'freebusy', 'read', 'edit']);
export type GrantLevel = z.infer<typeof GrantLevelSchema>;

export const GrantTargetSchema = z
  .object({
    userId: z.string().min(1).optional(),
    circleId: z.string().optional(),
    level: GrantLevelSchema,
  })
  .refine((g) => Boolean(g.userId) !== Boolean(g.circleId), 'set userId or circleId, not both');
export type GrantTarget = z.infer<typeof GrantTargetSchema>;

export const CalendarDefaultAccessSchema = z.enum(['none', 'freebusy', 'read']).nullable();
export type CalendarDefaultAccess = z.infer<typeof CalendarDefaultAccessSchema>;

export const CalendarGrantsSchema = z.object({
  defaultAccess: CalendarDefaultAccessSchema,
  grants: z.array(GrantTargetSchema),
});
export type CalendarGrants = z.infer<typeof CalendarGrantsSchema>;

export const OccurrenceSchema = z.object({
  eventId: z.string(),
  calendarId: z.string(),
  recurrenceId: isoDateTime,
  start: isoDateTime,
  end: isoDateTime,
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  allDay: z.boolean(),
  tz: z.string(),
  recurring: z.boolean(),
  overridden: z.boolean(),
  /** The task this event is a time block for, and whether it is done. */
  taskId: z.string().nullable().default(null),
  taskDone: z.boolean().default(false),
  /** Who added the event in Homa; null when unknown. */
  createdBy: CalendarOwnerSchema.nullable().default(null),
  /** Minutes of travel before the event; null for none. */
  travelMinutes: z.number().int().nullable().default(null),
  /** The poll that set this event: its time and place can't change. */
  pollId: z.string().nullable().default(null),
});
export type Occurrence = z.infer<typeof OccurrenceSchema>;
export const OccurrenceListSchema = z.array(OccurrenceSchema);

export const EventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  uid: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  start: isoDateTime,
  end: isoDateTime,
  allDay: z.boolean(),
  tz: z.string(),
  rrule: z.string().nullable(),
  travelMinutes: z.number().int().nullable().default(null),
  exdates: z.array(isoDateTime),
  /** Minutes before each occurrence's start. */
  reminders: z.array(z.number().int()).default([]),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type HomaEvent = z.infer<typeof EventSchema>;

export const SCOPES = ['this', 'following', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

/** What an .ics import did. */
export const ImportSummarySchema = z.object({
  imported: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  warnings: z.array(z.string()),
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;
