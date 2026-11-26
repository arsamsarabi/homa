import { afterEach, describe, expect, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import type { PublicInstance } from '@/schemas';
import { setUpInstance } from '@/testing/renderApp';
import { StatusCard } from './StatusCard';

const wrap = (ui: ReactNode, instance?: PublicInstance): JSX.Element => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (instance) client.setQueryData(['instance'], instance);
  return (
    <MantineProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MantineProvider>
  );
};

describe('StatusCard', () => {
  afterEach(cleanup);

  test('omits the instance name when instance data is absent', () => {
    render(
      wrap(
        <StatusCard title="Something went wrong">
          <p>body</p>
        </StatusCard>,
      ),
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.queryByText('Family')).toBeNull();
    expect(screen.queryByText(setUpInstance.name)).toBeNull();
  });

  test('shows the instance name when present', () => {
    render(
      wrap(
        <StatusCard title="Something went wrong">
          <p>body</p>
        </StatusCard>,
        { ...setUpInstance, name: 'Family' },
      ),
    );
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
  });
});
