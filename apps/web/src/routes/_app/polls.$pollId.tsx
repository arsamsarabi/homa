import { createFileRoute } from '@tanstack/react-router';
import { PollPage } from '@/pages/polls';

export const Route = createFileRoute('/_app/polls/$pollId')({ component: PollPage });
