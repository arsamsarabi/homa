import { createFileRoute } from '@tanstack/react-router';
import { CalendarPage } from '@/pages/calendar';
import { CalendarSearchSchema } from '@/schemas';

export const Route = createFileRoute('/_app/')({ validateSearch: CalendarSearchSchema, component: CalendarPage });
