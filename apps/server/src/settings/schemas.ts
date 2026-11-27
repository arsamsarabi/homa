// Request and response shapes for a user's settings.
import { isTimeZone, REMINDER_LIMITS } from '@homa/core';
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

export const DefaultReminderMinutes = z.number().int().min(0).max(REMINDER_LIMITS.maxMinutes).nullable().openapi({
  example: 10,
  description: 'The reminder the event form adds to new timed events, in minutes before; null for none',
});

const Weekday = z.number().int().min(0).max(6);

/** Which weekdays the work-week view shows; null means Monday–Friday. */
export const WorkWeekDays = z
  .array(Weekday)
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'each day at most once')
  .nullable()
  .openapi({
    example: [1, 2, 3, 4, 5],
    description: 'Days in the work-week view: 0 = Sunday … 6 = Saturday; 1–7 unique days; null is Monday–Friday',
  });

export const SharingPreset = z.enum(['private', 'freebusy', 'read']).openapi({
  description: 'Default for calendars with no per-calendar default: private shares nothing',
});

export const Settings = z
  .object({
    homeTz: HomeTz,
    secondaryCalendar: SecondaryCalendar,
    weekStart: WeekStart,
    workWeekDays: WorkWeekDays,
    defaultReminderMinutes: DefaultReminderMinutes,
    sharingPreset: SharingPreset,
    showShortcutHints: z.boolean().openapi({ description: 'Show keyboard shortcut hints beside buttons' }),
  })
  .openapi('Settings');

export const SettingsPatch = Settings.partial().openapi('SettingsPatch');
