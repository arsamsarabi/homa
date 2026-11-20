import { Alert, Anchor, Button, Container, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsFields } from '@/components';
import { useSession } from '@/hooks/session';
import { useSettingsDraft } from '@/hooks/settings';
import { CalendarsSection } from '@/pages/settings/calendars';
import { ConnectedCalendarsSection } from '@/pages/settings/connections';
import { ImportExportSection } from '@/pages/settings/import-export';
import { NotificationsSection } from '@/pages/settings/notifications';
import { browserTimeZone } from '@/services/zones';
import { useAnnouncer } from '@/stores';
import classes from './SettingsPage.module.css';

/** Your settings: home time zone, the second calendar, your calendars' colors and visibility, connections. Language and theme are in the header. */
export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const draft = useSettingsDraft();
  const announce = useAnnouncer((s) => s.announce);
  const isAdmin = useSession().data?.user.role === 'admin';
  const save = (): void => {
    draft
      .save()
      .then(() => announce(t('settings.saved')))
      .catch(() => undefined); // the error shows in the form through draft.error
  };
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Anchor component={Link} to="/" size="sm" className={classes.back}>
          <IconArrowLeft size={16} aria-hidden className={classes.arrow} />
          {t('settings.back')}
        </Anchor>
        <Title order={1}>{t('settings.title')}</Title>
        {draft.error && (
          <Alert color="red" role="alert">
            {t('settings.saveFailed', { message: draft.error })}
          </Alert>
        )}
        <SettingsFields value={draft.value} browserTz={browserTimeZone()} onChange={draft.change} />
        <Group>
          <Button onClick={save} loading={draft.busy}>
            {t('settings.save')}
          </Button>
        </Group>
        {isAdmin && (
          <Stack component="section" gap="xs" aria-labelledby="instance-settings">
            <Title order={2} size="h4" id="instance-settings">
              {t('instance.title')}
            </Title>
            <Text size="sm" c="dimmed">
              {t('instance.settingsLinkHint')}{' '}
              <Anchor component={Link} to="/admin">
                {t('instance.settingsLink')}
              </Anchor>
            </Text>
          </Stack>
        )}
        <NotificationsSection />
        <CalendarsSection />
        <ConnectedCalendarsSection />
        <ImportExportSection />
      </Stack>
    </Container>
  );
}
