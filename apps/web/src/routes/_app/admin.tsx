import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/router';
import { AdminPage } from '@/pages/admin';
import { AdminSearchSchema } from '@/schemas';

export const Route = createFileRoute('/_app/admin')({
  validateSearch: AdminSearchSchema,
  beforeLoad: requireAdmin,
  component: AdminPage,
});
