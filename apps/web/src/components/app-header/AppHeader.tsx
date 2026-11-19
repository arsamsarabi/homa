import { ActionIcon, Button, Group, Image, Menu, Title } from '@mantine/core';
import { IconLanguage, IconMoon, IconSettings, IconSun } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { type Language, languages } from '@/lib/i18n';

export type AppHeaderProps = {
  dark: boolean;
  onToggleColorScheme: () => void;
  onLanguage: (lng: Language) => void;
  onSignOut: () => void;
};

const LANGUAGES = Object.keys(languages) as Language[];

/** The app's top bar: logo, settings, language, light/dark and sign out. */
export function AppHeader({ dark, onToggleColorScheme, onLanguage, onSignOut }: AppHeaderProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Group h="100%" px="md" justify="space-between">
      <Group gap="xs">
        <Image src="/homa-capital-320.webp" alt="" h={32} w="auto" />
        <Title order={3}>{t('app.name')}</Title>
      </Group>
      <Group gap="xs">
        <ActionIcon component={Link} to="/settings" variant="default" size="lg" aria-label={t('nav.settings')}>
          <IconSettings size={18} aria-hidden />
        </ActionIcon>
        <Menu>
          <Menu.Target>
            <ActionIcon variant="default" size="lg" aria-label={t('nav.language')}>
              <IconLanguage size={18} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {LANGUAGES.map((lng) => (
              <Menu.Item key={lng} lang={lng} onClick={() => onLanguage(lng)}>
                {languages[lng].label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <ActionIcon variant="default" size="lg" onClick={onToggleColorScheme} aria-label={t('nav.theme')}>
          {dark ? <IconSun size={18} aria-hidden /> : <IconMoon size={18} aria-hidden />}
        </ActionIcon>
        <Button variant="default" onClick={onSignOut}>
          {t('nav.signOut')}
        </Button>
      </Group>
    </Group>
  );
}
