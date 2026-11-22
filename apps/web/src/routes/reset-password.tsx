import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '@/pages/auth';
import { ResetPasswordSearchSchema } from '@/schemas';

export const Route = createFileRoute('/reset-password')({
  validateSearch: ResetPasswordSearchSchema,
  component: ResetPasswordPage,
});
