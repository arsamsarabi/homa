import { afterEach, describe, expect, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import '@/lib/i18n';
import { ErrorBoundary } from './ErrorBoundary';

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
