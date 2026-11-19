import { createFileRoute } from '@tanstack/react-router';
import { OnboardingPage } from '@/pages/onboarding';

export const Route = createFileRoute('/_app/onboarding')({ component: OnboardingPage });
