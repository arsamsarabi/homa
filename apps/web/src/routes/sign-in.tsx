import { createFileRoute } from '@tanstack/react-router';
import { requireSignedOut } from '@/lib/router';
import { SignInPage } from '@/pages/auth';

export const Route = createFileRoute('/sign-in')({ beforeLoad: requireSignedOut, component: SignInPage });
