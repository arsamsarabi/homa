import { afterEach, describe, expect, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { sessionQuery } from '@/hooks/session';
import '@/lib/i18n';
import { theme } from '@/styles';
import { DemoWelcome } from './DemoWelcome';

/** Renders the welcome with a signed-in session already in the cache, or none. */
const renderWelcome = (sessionId: string | null): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(sessionQuery.queryKey, sessionId ? ({ session: { id: sessionId } } as never) : null);
  render(
    <QueryClientProvider client={client}>
      <MantineProvider theme={theme}>
        <DemoWelcome />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('DemoWelcome', () => {
  test('opens for a signed-in visitor and stays closed for that sign-in once dismissed', async () => {
    renderWelcome('s1');
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to the Homa demo' });
    expect(dialog.textContent).toContain('Everyone shares this account, and it resets every night.');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    cleanup();
    renderWelcome('s1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('opens again after a new sign-in', async () => {
    localStorage.setItem('homa-demo-welcome-seen', 's1');
    renderWelcome('s2');
    expect(await screen.findByRole('dialog', { name: 'Welcome to the Homa demo' })).toBeTruthy();
  });

  test('stays hidden while signed out', () => {
    renderWelcome(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
