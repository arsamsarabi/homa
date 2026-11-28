import { createFileRoute } from '@tanstack/react-router';
import { PollsPage } from '@/pages/polls';
import { PollsSearchSchema } from '@/schemas';

export const Route = createFileRoute('/_app/polls/')({ validateSearch: PollsSearchSchema, component: PollsPage });
