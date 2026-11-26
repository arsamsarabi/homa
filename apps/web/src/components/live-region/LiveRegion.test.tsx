import { describe, expect, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { LiveRegion } from './LiveRegion';

describe('LiveRegion', () => {
  test('shows an on-screen toast when toast is true', () => {
    render(
      <MantineProvider>
        <LiveRegion message="Instance settings saved" id={1} toast />
      </MantineProvider>,
    );
    expect(screen.getByTestId('announcer-toast').textContent).toBe('Instance settings saved');
  });

  test('stays polite-only when toast is false', () => {
    render(
      <MantineProvider>
        <LiveRegion message="Preview: Dentist" id={2} toast={false} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId('announcer-toast')).toBeNull();
    expect(screen.getByText('Preview: Dentist')).toBeTruthy();
  });
});
