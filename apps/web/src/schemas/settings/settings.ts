// The signed-in user's settings, as the API returns them.
import { z } from 'zod';

export const SECONDARY_CALENDARS = ['none', 'jalali'] as const;
export type SecondaryCalendar = (typeof SECONDARY_CALENDARS)[number];

export const SettingsSchema = z.object({
  /** null: use the browser's zone. */
  homeTz: z.string().nullable(),
  secondaryCalendar: z.enum(SECONDARY_CALENDARS),
  /** First day of the week, 0 = Sunday … 6 = Saturday; null (or absent) follows the UI language. */
  weekStart: z.number().int().min(0).max(6).nullable().optional(),
  /** The reminder new timed events start with, in minutes before; null for none; absent is 10. */
  defaultReminderMinutes: z.number().int().min(0).nullable().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;
