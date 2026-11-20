// Request and response shapes for a user's settings.
import { isTimeZone } from '@homa/core';
import { z } from '@hono/zod-openapi';

export const SECONDARY_CALENDARS = ['none', 'jalali'] as const;

const HomeTz = z
  .string()
  .refine(isTimeZone, 'an IANA time zone like Europe/London')
  .nullable()
  .openapi({ example: 'Asia/Tehran', description: "The zone the calendar is shown in; null uses the browser's" });

const SecondaryCalendar = z
  .enum(SECONDARY_CALENDARS)
  .openapi({ description: 'A second calendar shown beside the Gregorian one' });

export const WeekStart = z.number().int().min(0).max(6).nullable().openapi({
  example: 1,
  description:
    'First day of the week: 0 = Sunday … 6 = Saturday; null follows the language (Monday, or Saturday in Farsi)',
});

export const Settings = z
  .object({ homeTz: HomeTz, secondaryCalendar: SecondaryCalendar, weekStart: WeekStart })
  .openapi('Settings');

export const SettingsPatch = Settings.partial().openapi('SettingsPatch');
