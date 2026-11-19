import { createFileRoute } from '@tanstack/react-router';
import { requireSetup } from '@/lib/router';
import { SetupPage } from '@/pages/setup';

export const Route = createFileRoute('/setup')({ beforeLoad: requireSetup, component: SetupPage });
