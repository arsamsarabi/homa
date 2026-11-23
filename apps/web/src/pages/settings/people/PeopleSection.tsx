import { Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@/hooks/instance';
import { useSession } from '@/hooks/session';
import { CirclesPanel } from './CirclesPanel';
import { InvitesPanel } from './InvitesPanel';

/** People on this Homa: invites (for whoever may send them) and your circles. */
export function PeopleSection(): JSX.Element {
  const { t } = useTranslation();
  const isAdmin = useSession().data?.user.role === 'admin';
  const canInvite = isAdmin || Boolean(useInstance().data?.anyoneCanInvite);
  return (
    <Stack component="section" gap="md" aria-labelledby="people-settings">
      <Stack gap={4}>
        <Title order={2} size="h4" id="people-settings">
          {t('people.title')}
        </Title>
        <Text size="sm" c="dimmed">
          {t('people.hint')}
        </Text>
      </Stack>
      {canInvite && <InvitesPanel />}
      <CirclesPanel />
    </Stack>
  );
}
