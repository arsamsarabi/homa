import { afterEach, describe, expect, mock, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import '@/lib/i18n';

mock.module('@tanstack/react-router', () => ({
  useNavigate: () => mock(() => {}),
}));

const { ErrorBoundary } = await import('./ErrorBoundary');

const wrap = (ui: ReactNode): JSX.Element => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return (
    <MantineProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MantineProvider>
  );
};

function Boom(): JSX.Element {
  throw new Error('test boom');
}

describe('ErrorBoundary', () => {
  afterEach(cleanup);

  test('shows the runtime error page when a child throws', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
