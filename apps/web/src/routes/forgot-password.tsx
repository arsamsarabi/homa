import { createFileRoute } from '@tanstack/react-router';
import { requireSignedOut } from '@/lib/router';
import { ForgotPasswordPage } from '@/pages/auth';

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: requireSignedOut,
  component: ForgotPasswordPage,
});
