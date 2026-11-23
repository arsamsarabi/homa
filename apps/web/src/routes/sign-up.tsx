import { createFileRoute } from '@tanstack/react-router';
import { requireSignUpsOpen } from '@/lib/router';
import { SignUpPage } from '@/pages/auth';
import { SignUpSearchSchema } from '@/schemas';

export const Route = createFileRoute('/sign-up')({
  validateSearch: SignUpSearchSchema,
  beforeLoad: requireSignUpsOpen,
  component: SignUpPage,
});
