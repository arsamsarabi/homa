import { afterEach, describe, expect, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import '@/lib/i18n';
import { NotFoundPage } from './NotFoundPage';

const wrap = (ui: ReactNode): JSX.Element => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return (
    <MantineProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MantineProvider>
  );
};

describe('NotFoundPage', () => {
  afterEach(cleanup);

  test('has no technical details', () => {
    render(wrap(<NotFoundPage />));
    expect(screen.getByText(/isn’t here|is not here/i)).toBeTruthy();
    expect(screen.queryByText('Technical details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to calendar' })).toBeTruthy();
  });
});
