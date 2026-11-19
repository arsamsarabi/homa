// Query options and keys for calendar data. Responses are parsed with the schemas in @/schemas.
import { queryOptions } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import {
  type Calendar,
  CalendarListSchema,
  EventSchema,
  type HomaEvent,
  type Occurrence,
  OccurrenceListSchema,
} from '@/schemas';

export const calendarKeys = {
  calendars: ['calendars'] as const,
  occurrences: ['occurrences'] as const,
  event: (id: string): readonly ['event', string] => ['event', id] as const,
};

// biome-ignore lint/nursery/useExplicitType: queryOptions' inferred type carries the query key typing that useQuery needs.
export const calendarsQuery = () =>
  queryOptions({
    queryKey: calendarKeys.calendars,
    queryFn: async (): Promise<Calendar[]> => CalendarListSchema.parse(await unwrap(homaClient.GET('/calendars'))),
  });

// biome-ignore lint/nursery/useExplicitType: as above.
export const occurrencesQuery = (from: Date, to: Date) =>
  queryOptions({
    queryKey: [...calendarKeys.occurrences, from.toISOString(), to.toISOString()],
    queryFn: async (): Promise<Occurrence[]> =>
      OccurrenceListSchema.parse(
        await unwrap(
          homaClient.GET('/occurrences', { params: { query: { from: from.toISOString(), to: to.toISOString() } } }),
        ),
      ),
    // Keep showing the last range while the next one loads.
    placeholderData: (previous: Occurrence[] | undefined): Occurrence[] | undefined => previous,
  });

// biome-ignore lint/nursery/useExplicitType: as above.
export const eventQuery = (id: string) =>
  queryOptions({
    queryKey: calendarKeys.event(id),
    queryFn: async (): Promise<HomaEvent> =>
      EventSchema.parse(await unwrap(homaClient.GET('/events/{id}', { params: { path: { id } } }))),
  });
