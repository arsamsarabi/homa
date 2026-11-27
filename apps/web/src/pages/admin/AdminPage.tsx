import { Alert, Button, Container, Group, Loader, Stack, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { InstanceFields, PageBreadcrumbs, PageTabs, QueryErrorAlert } from '@/components';
import { useInstance, useInstanceSettingsDraft } from '@/hooks/instance';
import { isolate } from '@/lib/i18n';
import { ADMIN_TABS, type AdminTab } from '@/schemas';
import { useAnnouncer } from '@/stores';

/** The instance's settings, for its admins, in tabs kept in the URL (`?tab=`) like Settings. */
export function AdminPage(): JSX.Element {
  const { t } = useTranslation();
  const draft = useInstanceSettingsDraft();
  const announce = useAnnouncer((s) => s.announce);
  const oidc = useInstance().data?.oidc ?? null;
  const tab = useSearch({ from: '/_app/admin' }).tab ?? 'general';
  const navigate = useNavigate();
  const pick = (next: AdminTab): void => void navigate({ to: '/admin', search: { tab: next }, replace: true });

  // One draft across the General and Sign-ups tabs, so switching tabs keeps unsaved edits.
  const form = (part: 'general' | 'access'): JSX.Element => {
    if (draft.status === 'pending') return <Loader aria-label={t('instance.loading')} />;
    if (draft.status === 'error')
      return <QueryErrorAlert title={t('instance.loadFailed')} error={draft.error} onRetry={draft.retry} />;
    const save = (): void => {
      draft
        .save()
        .then(() => announce(t('instance.saved')))
        .catch(() => undefined); // the error shows in the form through draft.error
    };
    return (
      <Stack>
        {draft.error && (
          <Alert color="red" role="alert">
            {t('instance.saveFailed', { message: draft.error })}
          </Alert>
        )}
        <InstanceFields value={draft.value} onChange={draft.change} part={part} />
        <Group>
          <Button onClick={save} loading={draft.busy} disabled={draft.busy || draft.value.name.trim() === ''}>
            {t('settings.save')}
          </Button>
        </Group>
      </Stack>
    );
  };

  return (
    <Container size="lg" py="xl">
      <Stack>
        <PageBreadcrumbs trail={[{ label: t('nav.admin'), href: '/admin' }, { label: t(`instance.tabs.${tab}`) }]} />
        <Title order={1}>{t('instance.title')}</Title>
        <PageTabs
          tabs={ADMIN_TABS}
          value={tab}
          onChange={pick}
          label={(x: AdminTab): string => t(`instance.tabs.${x}`)}
        >
          <Tabs.Panel value="general">{form('general')}</Tabs.Panel>
          <Tabs.Panel value="access">{form('access')}</Tabs.Panel>
          <Tabs.Panel value="sso">
            <Stack gap="xs" component="section" aria-labelledby="oidc-status">
              <Title order={2} size="h4" id="oidc-status">
                {t('instance.oidcTitle')}
              </Title>
              <Text size="sm" c="dimmed">
                {t('instance.oidcHint')}
              </Text>
              <Text size="sm">{oidc ? t('instance.oidcOn', { name: isolate(oidc.name) }) : t('instance.oidcOff')}</Text>
              {oidc && (
                <TextInput
                  label={t('instance.oidcRedirect')}
                  description={t('instance.oidcRedirectHint')}
                  value={oidc.redirectUri}
                  readOnly
                />
              )}
            </Stack>
          </Tabs.Panel>
        </PageTabs>
      </Stack>
    </Container>
  );
}
