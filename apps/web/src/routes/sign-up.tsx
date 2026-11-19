import { createFileRoute } from '@tanstack/react-router';
import { requireSignUpsOpen } from '@/lib/router';
import { SignUpPage } from '@/pages/auth';

export const Route = createFileRoute('/sign-up')({ beforeLoad: requireSignUpsOpen, component: SignUpPage });
