import { createFileRoute } from '@tanstack/react-router';
import { requireSignedOut } from '@/lib/router';
import { SignUpPage } from '@/pages/auth';

export const Route = createFileRoute('/sign-up')({ beforeLoad: requireSignedOut, component: SignUpPage });
