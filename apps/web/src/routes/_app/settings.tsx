import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/pages/settings';
import { SettingsSearchSchema } from '@/schemas';

export const Route = createFileRoute('/_app/settings')({
  validateSearch: SettingsSearchSchema,
  component: SettingsPage,
});
