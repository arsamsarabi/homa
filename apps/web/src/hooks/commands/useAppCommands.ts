// The command palette's actions: calendar navigation, task lists, settings, theme, language and sign out.
import type { SpotlightActionGroupData } from '@mantine/spotlight';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type Language, languages } from '@/lib/i18n';
import { VIEWS } from '@/schemas';

export type AppCommandHandlers = {
  dark: boolean;
  onToggleColorScheme: () => void;
  onLanguage: (lng: Language) => void;
  onShowShortcuts: () => void;
  onSignOut: () => void;
};

export function useAppCommands(h: AppCommandHandlers): SpotlightActionGroupData[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const go = (search: { view?: (typeof VIEWS)[number] }): void => {
    void navigate({ to: '/', search });
  };
  return [
    {
      group: t('palette.calendar'),
      actions: [
        { id: 'today', label: t('calendar.today'), onClick: (): void => go({}) },
        ...VIEWS.map((v) => ({
          id: `view.${v}`,
          label: t('palette.showView', { view: t(`calendar.views.${v}`) }),
          onClick: (): void => go({ view: v }),
        })),
      ],
    },
    {
      group: t('palette.tasks'),
      actions: (['inbox', 'today', 'upcoming'] as const).map((list) => ({
        id: `tasks.${list}`,
        label: `${t('nav.tasks')}: ${t(`tasks.${list}`)}`,
        onClick: (): void => void navigate({ to: '/tasks', search: { list } }),
      })),
    },
    {
      group: t('palette.app'),
      actions: [
        { id: 'polls', label: t('nav.polls'), onClick: (): void => void navigate({ to: '/polls' }) },
        { id: 'settings', label: t('nav.settings'), onClick: (): void => void navigate({ to: '/settings' }) },
        { id: 'shortcuts', label: t('nav.shortcuts'), onClick: h.onShowShortcuts },
        { id: 'theme', label: t(h.dark ? 'nav.lightTheme' : 'nav.darkTheme'), onClick: h.onToggleColorScheme },
        ...(Object.keys(languages) as Language[]).map((lng) => ({
          id: `language.${lng}`,
          label: `${t('nav.language')}: ${languages[lng].label}`,
          onClick: (): void => h.onLanguage(lng),
        })),
        { id: 'sign-out', label: t('nav.signOut'), onClick: h.onSignOut },
      ],
    },
  ];
}
