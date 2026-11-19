import { AppShell, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';
import { AppHeader, LiveRegion } from '@/components';
import { useSignOut } from '@/hooks/session';
import { setLanguage } from '@/lib/i18n';
import { useAnnouncer } from '@/stores';

/** The signed-in shell: header, the page, and the screen-reader live region. */
export function AppLayout(): JSX.Element {
  const { toggleColorScheme } = useMantineColorScheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const signOut = useSignOut();
  const message = useAnnouncer((s) => s.message);
  const id = useAnnouncer((s) => s.id);

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <AppHeader
          dark={dark}
          onToggleColorScheme={toggleColorScheme}
          onLanguage={setLanguage}
          onSignOut={() => void signOut().catch((err: unknown) => console.error('sign out failed', err))}
        />
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <LiveRegion message={message} id={id} />
    </AppShell>
  );
}
