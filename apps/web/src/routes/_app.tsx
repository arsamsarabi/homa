import { createFileRoute } from '@tanstack/react-router';
import { requireSignedIn } from '@/lib/router';
import { AppLayout } from '@/pages/app-layout';

export const Route = createFileRoute('/_app')({ beforeLoad: requireSignedIn, component: AppLayout });
