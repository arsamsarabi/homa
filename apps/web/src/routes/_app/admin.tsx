import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/router';
import { AdminPage } from '@/pages/admin';

export const Route = createFileRoute('/_app/admin')({ beforeLoad: requireAdmin, component: AdminPage });
