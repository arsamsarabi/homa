// Request and response schemas for calendars, events and occurrences. They drive validation and
// the OpenAPI document (and so the generated web client).
import { isTimeZone, parseRrule } from '@homa/core';
import { z } from '@hono/zod-openapi';

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #7d7fa3');
export const Calendar = z
  .object({
    id: z.uuid(),
    name: z.string(),
    color: Color,
    connectionId: z.uuid().nullable().openapi({ description: 'The connection it syncs with; null for your own' }),
    readOnly: z.boolean().openapi({ description: 'Events here cannot be created, changed or deleted (subscriptions)' }),
    hidden: z.boolean().openapi({ description: 'Left out of the calendar views; its events still sync' }),
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

export const Id = z.object({ id: z.uuid() });
