import { afterEach, describe, expect, mock, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import '@/lib/i18n';

mock.module('@tanstack/react-router', () => ({
  useNavigate: () => mock(() => {}),
}));

const { RuntimeErrorPage } = await import('./RuntimeErrorPage');

const wrap = (ui: ReactNode): JSX.Element => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return (
    <MantineProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MantineProvider>
  );
};

describe('RuntimeErrorPage', () => {
  afterEach(cleanup);

  test('hides technical details until expanded', () => {
    render(wrap(<RuntimeErrorPage error={new Error('boom')} onRetry={() => {}} />));
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to calendar' })).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('boom')).toBeTruthy();
  });
});
