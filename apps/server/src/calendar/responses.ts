// Database rows to API responses (dates as ISO strings, internal columns left out).
import type { repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import type { OccurrenceView } from './occurrences-service';
import type { Calendar, Event, Occurrence } from './schemas';

export const calendarOut = (c: repo.CalendarRow): z.infer<typeof Calendar> => ({
  id: c.id,
  name: c.name,
  color: c.color,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export const eventOut = (e: repo.EventRow): z.infer<typeof Event> => ({
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
  exdates: e.exdates.map((d) => d.toISOString()),
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
});
