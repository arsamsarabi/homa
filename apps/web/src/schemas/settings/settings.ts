// The signed-in user's settings, as the API returns them.
import { z } from 'zod';

export const SECONDARY_CALENDARS = ['none', 'jalali'] as const;
export type SecondaryCalendar = (typeof SECONDARY_CALENDARS)[number];

export const SettingsSchema = z.object({
  /** null: use the browser's zone. */
  homeTz: z.string().nullable(),
  secondaryCalendar: z.enum(SECONDARY_CALENDARS),
});
export type Settings = z.infer<typeof SettingsSchema>;
