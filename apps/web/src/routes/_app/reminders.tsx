import { createFileRoute } from '@tanstack/react-router';
import { RemindersPage } from '@/pages/reminders';

export const Route = createFileRoute('/_app/reminders')({ component: RemindersPage });
