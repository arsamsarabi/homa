import { ActionIcon, AppShell, Button, Group, Image, Menu, Title, useMantineColorScheme } from '@mantine/core';
import { IconLanguage, IconMoon, IconSun } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { authClient } from '../auth-client';
import { type Language, languages, setLanguage } from '../i18n';
import { sessionQuery } from '../session';

export function AppLayout() {
  const { t } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    queryClient.setQueryData(sessionQuery.queryKey, null);
    await navigate({ to: '/sign-in' });
  }

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Image src="/homa-capital-320.webp" alt="" h={32} w="auto" />
            <Title order={3}>{t('app.name')}</Title>
          </Group>
          <Group gap="xs">
            <Menu>
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label={t('nav.language')}>
                  <IconLanguage size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {(Object.keys(languages) as Language[]).map((lng) => (
                  <Menu.Item key={lng} onClick={() => setLanguage(lng)}>
                    {languages[lng].label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <ActionIcon variant="default" size="lg" onClick={toggleColorScheme} aria-label={t('nav.theme')}>
              {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
            <Button variant="default" onClick={signOut}>
              {t('nav.signOut')}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
