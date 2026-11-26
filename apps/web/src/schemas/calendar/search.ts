// The calendar route's search params: ?view=week&date=2026-11-19&tz=Asia/Tehran. Bad values fall
// back to the defaults instead of failing the route.
import { z } from 'zod';
import { isTimeZone } from '@/services/zones';

export const VIEWS = ['day', 'week', 'workWeek', 'month', 'year', 'agenda'] as const;
export type View = (typeof VIEWS)[number];
export const DEFAULT_VIEW: View = 'week';

export const CalendarSearchSchema = z.object({
  view: z.enum(VIEWS).optional().catch(undefined),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  /** View in this zone instead of the home zone. */
  tz: z.string().refine(isTimeZone).optional().catch(undefined),
});
export type CalendarSearch = z.infer<typeof CalendarSearchSchema>;
