// The calendar route's search params: ?view=week&date=2026-11-19. Bad values fall back to the
// defaults instead of failing the route.
import { z } from 'zod';

export const VIEWS = ['day', 'week', 'month', 'year', 'agenda'] as const;
export type View = (typeof VIEWS)[number];
export const DEFAULT_VIEW: View = 'week';

export const CalendarSearchSchema = z.object({
  view: z.enum(VIEWS).optional().catch(undefined),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});
export type CalendarSearch = z.infer<typeof CalendarSearchSchema>;
