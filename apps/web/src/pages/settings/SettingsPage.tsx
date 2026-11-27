import { Alert, Button, Container, Group, Stack, Tabs, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { PageBreadcrumbs, SettingsFields } from '@/components';
import { useSettingsDraft } from '@/hooks/settings';
import { CalendarsSection } from '@/pages/settings/calendars';
import { ConnectedCalendarsSection } from '@/pages/settings/connections';
import { ImportExportSection, TodoistImportSection } from '@/pages/settings/import-export';
import { ChannelsSection, NotificationsSection } from '@/pages/settings/notifications';
import { PeopleSection } from '@/pages/settings/people';
import { SecuritySection } from '@/pages/settings/security';
import { SETTINGS_TABS, type SettingsTab } from '@/schemas';
import { browserTimeZone } from '@/services/zones';
import { useAnnouncer } from '@/stores';

/** Your settings, in tabs kept in the URL (`?tab=`). Language and theme are in the header. */
export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const draft = useSettingsDraft();
  const announce = useAnnouncer((s) => s.announce);
  const search = useSearch({ from: '/_app/settings' });
  const navigate = useNavigate();
  // Tabs run down the side, except on phones where they'd squeeze the content.
  const phone = useMediaQuery('(max-width: 48em)');
  // A Google or Microsoft callback lands on Calendars, where its picker opens.
  const fromCallback = Boolean(search.google || search.googleError || search.microsoft || search.microsoftError);
  const tab: SettingsTab = search.tab ?? (fromCallback ? 'calendars' : 'general');
  const pick = (next: string | null): void => {
    const found = SETTINGS_TABS.find((x) => x === next);
    if (found) void navigate({ to: '/settings', search: { tab: found }, replace: true });
  };
  const save = (): void => {
    draft
      .save()
      .then(() => announce(t('settings.saved')))
      .catch(() => undefined); // the error shows in the form through draft.error
  };
  return (
    <Container size="lg" py="xl">
      <Stack>
        <PageBreadcrumbs
          trail={[{ label: t('settings.title'), href: '/settings' }, { label: t(`settings.tabs.${tab}`) }]}
        />
        <Title order={1}>{t('settings.title')}</Title>
        <Tabs value={tab} onChange={pick} keepMounted={false} orientation={phone ? 'horizontal' : 'vertical'}>
          <Tabs.List mb={phone ? 'md' : undefined} me={phone ? undefined : 'xl'}>
            {SETTINGS_TABS.map((x) => (
              <Tabs.Tab key={x} value={x}>
                {t(`settings.tabs.${x}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="general">
            <Stack>
              {draft.error && (
                <Alert color="red" role="alert">
                  {t('settings.saveFailed', { message: draft.error })}
                </Alert>
              )}
              <SettingsFields value={draft.value} browserTz={browserTimeZone()} onChange={draft.change} />
              <Group>
                <Button onClick={save} loading={draft.busy} disabled={draft.busy}>
                  {t('settings.save')}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="calendars">
            <Stack gap="xl">
              <CalendarsSection />
              <ConnectedCalendarsSection />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="notifications">
            <Stack gap="xl">
              <NotificationsSection />
              <ChannelsSection />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="people">
            <Stack gap="xl">
              <PeopleSection />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="security">
            <Stack gap="xl">
              <SecuritySection />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="data">
            <Stack gap="xl">
              <ImportExportSection />
              <TodoistImportSection />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
