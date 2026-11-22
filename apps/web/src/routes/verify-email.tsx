import { createFileRoute } from '@tanstack/react-router';
import { loadSession } from '@/lib/router';
import { VerifyEmailPage } from '@/pages/auth';
import { VerifyEmailSearchSchema } from '@/schemas';

export const Route = createFileRoute('/verify-email')({
  validateSearch: VerifyEmailSearchSchema,
  beforeLoad: loadSession,
  component: VerifyEmailPage,
});
