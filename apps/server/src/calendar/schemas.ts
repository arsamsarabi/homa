// Request and response schemas for calendars, events and occurrences. They drive validation and
// the OpenAPI document (and so the generated web client).
import { isTimeZone, parseRrule, REMINDER_LIMITS } from '@homa/core';
import { z } from '@hono/zod-openapi';

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #7d7fa3');
export const AccessLevel = z.enum(['owner', 'freebusy', 'read', 'edit']).openapi({
  description: 'Effective access on this calendar for the caller',
});
export const CalendarOwner = z.object({ id: z.string().min(1), name: z.string() }).openapi('CalendarOwner');
export const Calendar = z
  .object({
    id: z.uuid(),
    name: z.string(),
    color: Color.openapi({ description: 'For a shared calendar, your own color when you picked one' }),
    connectionId: z.uuid().nullable().openapi({ description: 'The connection it syncs with; null for your own' }),
    readOnly: z.boolean().openapi({ description: 'Events here cannot be created, changed or deleted (subscriptions)' }),
    hidden: z.boolean().openapi({
      description: 'Left out of the calendar views; for a shared calendar this is your own choice',
    }),
    remoteMissing: z.boolean().openapi({
      description: 'Deleted at the source, or no longer shared with the account; it can be deleted here',
    }),
    access: AccessLevel,
    owner: CalendarOwner,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Calendar');
export const CalendarInput = z
  .object({ name: z.string().trim().min(1).max(100), color: Color.optional() })
  .openapi('CalendarInput');
export const CalendarPatch = CalendarInput.partial()
  .extend({ hidden: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to change')
  .openapi('CalendarPatch');

export const GRANT_LIMITS = { grantsPerCalendar: 200 } as const;
export const GrantLevel = z.enum(['none', 'freebusy', 'read', 'edit']);
export const CalendarDefault = z.enum(['none', 'freebusy', 'read']).nullable();
export const GrantTarget = z
  .object({
    userId: z.string().min(1).optional(),
    circleId: z.uuid().optional(),
    level: GrantLevel,
  })
  .refine((g) => Boolean(g.userId) !== Boolean(g.circleId), 'set userId or circleId, not both')
  .openapi('GrantTarget');
export const CalendarGrants = z
  .object({
    defaultAccess: CalendarDefault,
    grants: z.array(GrantTarget).max(GRANT_LIMITS.grantsPerCalendar),
  })
  .openapi('CalendarGrants');
export const CalendarGrantsPut = CalendarGrants.openapi('CalendarGrantsPut');

const Tz = z.string().refine(isTimeZone, 'an IANA time zone like Europe/London').openapi({ example: 'Europe/London' });
const isRrule = (v: string): boolean => {
  try {
    parseRrule(v);
    return true;
  } catch {
    return false; // not a usable RRULE; the refine below reports it
  }
};
const Rrule = z
  .string()
  .max(1000)
  .refine(isRrule, 'an RRULE value like FREQ=WEEKLY;BYDAY=MO')
  .transform((v) => v.replace(/^RRULE:/i, ''))
  .openapi({ example: 'FREQ=WEEKLY;BYDAY=MO' });
const When = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const Reminders = z
  .array(z.int().min(0).max(REMINDER_LIMITS.maxMinutes))
  .max(REMINDER_LIMITS.perEvent)
  .openapi({
    example: [10, 1440],
    description: `Minutes before each occurrence's start, at most ${REMINDER_LIMITS.perEvent}; whole days keep the wall time across clock changes`,
  });
export const RemindersInput = z.object({ reminders: Reminders }).openapi('RemindersInput');

export const Event = z
  .object({
    id: z.uuid(),
    calendarId: z.uuid(),
    uid: z.string(),
    summary: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    allDay: z.boolean(),
    tz: z.string(),
    rrule: z.string().nullable(),
    exdates: z.array(z.iso.datetime()),
    rdates: z.array(z.iso.datetime()),
    reminders: Reminders,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Event');

const EventFields = z.object({
  calendarId: z.uuid(),
  summary: z.string().max(500),
  description: z.string().max(10_000).nullable(),
  location: z.string().max(500).nullable(),
  start: When,
  end: When,
  allDay: z.boolean(),
  tz: Tz,
  rrule: Rrule.nullable(),
});
export const EventInput = EventFields.extend({
  description: EventFields.shape.description.optional(),
  location: EventFields.shape.location.optional(),
  allDay: EventFields.shape.allDay.default(false),
  rrule: EventFields.shape.rrule.optional(),
  reminders: Reminders.optional(),
})
  .refine((v) => v.end > v.start, { message: 'end must be after start', path: ['end'] })
  .openapi('EventInput');
export const EventPatch = EventFields.partial().openapi('EventPatch');

export const Scope = z.enum(['this', 'following', 'all']).default('all').openapi({
  description: 'For recurring events: one occurrence, this one and the rest, or the whole series',
});
export const ScopeQuery = z.object({ scope: Scope, recurrenceId: When.optional() });

export const Occurrence = z
  .object({
    eventId: z.uuid(),
    calendarId: z.uuid(),
    recurrenceId: z.iso.datetime(),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    summary: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    allDay: z.boolean(),
    tz: z.string(),
    recurring: z.boolean(),
    overridden: z.boolean(),
    taskId: z.uuid().nullable().openapi({ description: 'The task this event is a time block for' }),
    taskDone: z.boolean().openapi({ description: 'That task is completed' }),
    createdBy: CalendarOwner.nullable().openapi({
      description: 'Who added the event in Homa; null when unknown (synced, imported or older events, or free/busy)',
    }),
  })
  .openapi('Occurrence');

export const MAX_RANGE_DAYS = 400;
export const OccurrenceQuery = z
  .object({
    from: When,
    to: When,
    calendarId: z
      .union([z.uuid(), z.array(z.uuid())])
      .optional()
      .transform((v) => (v === undefined ? undefined : [v].flat())),
  })
  .refine((q) => q.to > q.from, { message: 'to must be after from', path: ['to'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= MAX_RANGE_DAYS * 86_400_000, {
    message: `the range can be at most ${MAX_RANGE_DAYS} days`,
    path: ['to'],
  });

export const AVAILABILITY_LIMITS = { maxPeople: 50, maxRangeDays: 92 } as const;
export const BusyInterval = z.object({ start: z.iso.datetime(), end: z.iso.datetime() }).openapi('BusyInterval');
export const PersonAvailability = z
  .object({
    userId: z.string().min(1),
    shared: z.boolean().openapi({ description: 'False when the caller sees none of this person’s calendars' }),
    busy: z.array(BusyInterval),
  })
  .openapi('PersonAvailability');
export const Availability = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    people: z.array(PersonAvailability),
  })
  .openapi('Availability');
export const AvailabilityInput = z
  .object({
    from: When,
    to: When,
    userIds: z.array(z.string().min(1)).max(AVAILABILITY_LIMITS.maxPeople),
  })
  .refine((q) => q.to > q.from, { message: 'to must be after from', path: ['to'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= AVAILABILITY_LIMITS.maxRangeDays * 86_400_000, {
    message: `the range can be at most ${AVAILABILITY_LIMITS.maxRangeDays} days`,
    path: ['to'],
  })
  .openapi('AvailabilityInput');

export const Id = z.object({ id: z.uuid() });
