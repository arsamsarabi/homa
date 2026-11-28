// Database rows to API responses (dates as ISO strings, internal columns left out).
import type { repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import type { AccessibleCalendar } from './access';
import type { AvailabilityOut } from './availability-service';
import type { OccurrenceView } from './occurrences-service';
import type { Availability, Calendar, CalendarGrants, Event, Occurrence } from './schemas';

export const calendarOut = (c: AccessibleCalendar): z.infer<typeof Calendar> => ({
  id: c.calendar.id,
  name: c.calendar.name,
  color: c.color,
  connectionId: c.calendar.connectionId,
  readOnly: c.calendar.readOnly,
  hidden: c.hidden,
  remoteMissing: c.calendar.remoteMissing,
  access: c.access,
  owner: c.owner,
  createdAt: c.calendar.createdAt.toISOString(),
  updatedAt: c.calendar.updatedAt.toISOString(),
});

/** An event with its reminders' minutes. */
export type EventWithReminders = repo.EventRow & { reminders: number[] };

export const eventOut = (e: EventWithReminders): z.infer<typeof Event> => ({
  id: e.id,
  calendarId: e.calendarId,
  uid: e.uid,
  summary: e.summary,
  description: e.description,
  location: e.location,
  start: e.startAt.toISOString(),
  end: e.endAt.toISOString(),
  allDay: e.allDay,
  tz: e.tz,
  rrule: e.rrule,
  travelMinutes: e.travelMinutes,
  exdates: e.exdates.map((d) => d.toISOString()),
  rdates: e.rdates.map((d) => d.toISOString()),
  reminders: e.reminders,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

export const occurrenceOut = (o: OccurrenceView): z.infer<typeof Occurrence> => ({
  eventId: o.event.id,
  calendarId: o.event.calendarId,
  recurrenceId: o.recurrenceId.toISOString(),
  start: o.start.toISOString(),
  end: o.end.toISOString(),
  summary: o.summary,
  description: o.description,
  location: o.location,
  allDay: o.event.allDay,
  tz: o.event.tz,
  recurring: o.event.rrule !== null,
  overridden: o.overridden,
  taskId: o.task?.id ?? null,
  taskDone: o.task?.done ?? false,
  createdBy: o.createdBy ?? null,
  travelMinutes: o.event.travelMinutes,
  pollId: o.pollId ?? null,
});

/** Free/busy: times only; empty title; no description, location, recurrence flags or task (decision 13). */
export const freebusyOccurrenceOut = (o: OccurrenceView): z.infer<typeof Occurrence> => ({
  ...occurrenceOut(o),
  summary: '',
  description: null,
  location: null,
  recurring: false,
  overridden: false,
  taskId: null,
  taskDone: false,
  createdBy: null,
  pollId: null,
});

export const grantsOut = (
  defaultAccess: 'none' | 'freebusy' | 'read' | null,
  grants: readonly repo.CalendarGrantRow[],
): z.infer<typeof CalendarGrants> => ({
  defaultAccess,
  grants: grants.map((g) =>
    g.granteeUserId ? { userId: g.granteeUserId, level: g.level } : { circleId: g.circleId as string, level: g.level },
  ),
});

export const availabilityOut = (a: AvailabilityOut): z.infer<typeof Availability> => ({
  from: a.from.toISOString(),
  to: a.to.toISOString(),
  people: a.people.map((p) => ({
    userId: p.userId,
    shared: p.shared,
    busy: p.busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
  })),
});
