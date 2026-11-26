// The signed-in user's settings, as the API returns them.
import { z } from 'zod';

export const SECONDARY_CALENDARS = ['none', 'jalali'] as const;
export type SecondaryCalendar = (typeof SECONDARY_CALENDARS)[number];

/** Monday–Friday when the user has not chosen work-week days. */
export const DEFAULT_WORK_WEEK_DAYS = [1, 2, 3, 4, 5] as const;

export const SettingsSchema = z.object({
  /** null: use the browser's zone. */
  homeTz: z.string().nullable(),
  secondaryCalendar: z.enum(SECONDARY_CALENDARS),
  /** First day of the week, 0 = Sunday … 6 = Saturday; null (or absent) follows the UI language. */
  weekStart: z.number().int().min(0).max(6).nullable().optional(),
  /**
   * Days in the work-week view, 0 = Sunday … 6 = Saturday; null (or absent) is Monday–Friday.
   * One to seven unique days.
   */
  workWeekDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).nullable().optional(),
  /** The reminder new timed events start with, in minutes before; null for none; absent is 10. */
  defaultReminderMinutes: z.number().int().min(0).nullable().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;
