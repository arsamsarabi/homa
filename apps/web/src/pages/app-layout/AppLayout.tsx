import { AppShell, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { spotlight } from '@mantine/spotlight';
import { Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { AppHeader, CommandPalette, LiveRegion, ShortcutsHelp } from '@/components';
import { useAppCommands } from '@/hooks/commands';
import { useSession, useSignOut } from '@/hooks/session';
import { type Language, setLanguage } from '@/lib/i18n';
import { useAnnouncer } from '@/stores';
import { HeaderBell } from './HeaderBell';

/** The signed-in shell: header, the page, the command palette, shortcut help and the live region. */
export function AppLayout(): JSX.Element {
  const { i18n } = useTranslation();
  const { toggleColorScheme } = useMantineColorScheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const { data: session } = useSession();
  const signOut = useSignOut();
  const message = useAnnouncer((s) => s.message);
  const id = useAnnouncer((s) => s.id);
  const toast = useAnnouncer((s) => s.toast);
  const kind = useAnnouncer((s) => s.kind);
  const [helpOpen, help] = useDisclosure(false);
  useHotkeys([['shift+slash', help.open, { usePhysicalKeys: true }]]);

  const onSignOut = (): void => void signOut().catch((err: unknown) => console.error('sign out failed', err));
  const actions = useAppCommands({
    dark,
    onToggleColorScheme: toggleColorScheme,
    onLanguage: setLanguage,
    onShowShortcuts: help.open,
    onSignOut,
  });

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <AppHeader
          userName={session?.user.name ?? ''}
          isAdmin={session?.user.role === 'admin'}
          dark={dark}
          language={i18n.language as Language}
          onToggleColorScheme={toggleColorScheme}
          onLanguage={setLanguage}
          onOpenPalette={spotlight.open}
          onShowShortcuts={help.open}
          onSignOut={onSignOut}
          bell={<HeaderBell />}
        />
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <CommandPalette actions={actions} />
      <ShortcutsHelp opened={helpOpen} onClose={help.close} />
      <LiveRegion message={message} id={id} toast={toast} kind={kind} />
    </AppShell>
  );
}
