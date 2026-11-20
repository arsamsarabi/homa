// Standalone reminders (a title and a time, optionally repeating), and an event's reminders.
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { calendarKeys } from '@/hooks/calendar';
import { EventSchema, type HomaEvent, type Reminder, ReminderListSchema, ReminderSchema } from '@/schemas';

export const reminderKeys = { list: ['reminders'] as const };

export const useReminders = (): UseQueryResult<Reminder[]> =>
  useQuery({
    queryKey: reminderKeys.list,
    queryFn: async (): Promise<Reminder[]> => ReminderListSchema.parse(await unwrap(homaClient.GET('/reminders'))),
  });

export type ReminderFields = { title: string; at: string; tz: string; rrule: string | null };

export type ReminderMutations = {
  create: UseMutationResult<Reminder, Error, ReminderFields>;
  update: UseMutationResult<Reminder, Error, ReminderFields & { id: string }>;
  remove: UseMutationResult<void, Error, string>;
};

export function useReminderMutations(): ReminderMutations {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: reminderKeys.list });
  return {
    create: useMutation({
      mutationFn: async (body: ReminderFields): Promise<Reminder> =>
        ReminderSchema.parse(await unwrap(homaClient.POST('/reminders', { body }))),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: ReminderFields & { id: string }): Promise<Reminder> =>
        ReminderSchema.parse(await unwrap(homaClient.PATCH('/reminders/{id}', { params: { path: { id } }, body }))),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/reminders/{id}', { params: { path: { id } } }));
      },
      onSettled: refresh,
    }),
  };
}

/** Replaces an event's reminders (minutes before each occurrence). */
export function useSetEventReminders(): UseMutationResult<HomaEvent, Error, { id: string; reminders: number[] }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reminders }: { id: string; reminders: number[] }): Promise<HomaEvent> =>
      EventSchema.parse(
        await unwrap(homaClient.PUT('/events/{id}/reminders', { params: { path: { id } }, body: { reminders } })),
      ),
    onSuccess: (e: HomaEvent): void => {
      qc.setQueryData(calendarKeys.event(e.id), e);
    },
  });
}
