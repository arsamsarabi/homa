import { ActionIcon, Avatar, Group, Image, Menu, Text, Title, UnstyledButton } from '@mantine/core';
import {
  IconChecklist,
  IconChevronDown,
  IconKeyboard,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type Language, languages } from '@/lib/i18n';
import classes from './AppHeader.module.css';

export type AppHeaderProps = {
  userName: string;
  dark: boolean;
  language: Language;
  onToggleColorScheme: () => void;
  onLanguage: (lng: Language) => void;
  onOpenPalette: () => void;
  onShowShortcuts: () => void;
  onSignOut: () => void;
  /** The notification bell, beside the account menu. */
  bell?: ReactNode;
};

const LANGUAGES = Object.keys(languages) as Language[];

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** The app's top bar: the logo (home), tasks, the bell, and one menu with search, settings, language, theme and sign out. */
export function AppHeader(props: AppHeaderProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <UnstyledButton component={Link} to="/" className={classes.home} aria-label={t('nav.home')}>
        <Image src="/homa-capital-320.webp" alt="" h={32} w="auto" />
        <Title order={3} component="span">
          {t('app.name')}
        </Title>
      </UnstyledButton>
      <Group gap="xs" wrap="nowrap">
        <ActionIcon component={Link} to="/tasks" variant="subtle" size="lg" aria-label={t('nav.tasks')}>
          <IconChecklist size={20} aria-hidden />
        </ActionIcon>
        {props.bell}
        <Menu position="bottom-end" width={240}>
          <Menu.Target>
            <UnstyledButton className={classes.account} aria-label={t('nav.account')}>
              <Avatar size="sm" color="primary" name={props.userName}>
                {initials(props.userName)}
              </Avatar>
              <Text size="sm" visibleFrom="xs">
                {props.userName}
              </Text>
              <IconChevronDown size={14} aria-hidden />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconSearch size={16} aria-hidden />}
              onClick={props.onOpenPalette}
              rightSection={
                <Text size="xs" c="dimmed">
                  ⌘K
                </Text>
              }
            >
              {t('nav.palette')}
            </Menu.Item>
            <Menu.Item leftSection={<IconSettings size={16} aria-hidden />} component={Link} to="/settings">
              {t('nav.settings')}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconKeyboard size={16} aria-hidden />}
              onClick={props.onShowShortcuts}
              rightSection={
                <Text size="xs" c="dimmed">
                  ?
                </Text>
              }
            >
              {t('nav.shortcuts')}
            </Menu.Item>
            <Menu.Item
              leftSection={props.dark ? <IconSun size={16} aria-hidden /> : <IconMoon size={16} aria-hidden />}
              onClick={props.onToggleColorScheme}
            >
              {t(props.dark ? 'nav.lightTheme' : 'nav.darkTheme')}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{t('nav.language')}</Menu.Label>
            {LANGUAGES.map((lng) => (
              <Menu.Item
                key={lng}
                lang={lng}
                onClick={() => props.onLanguage(lng)}
                aria-current={lng === props.language || undefined}
                fw={lng === props.language ? 700 : undefined}
              >
                {languages[lng].label}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item leftSection={<IconLogout size={16} aria-hidden />} onClick={props.onSignOut}>
              {t('nav.signOut')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
