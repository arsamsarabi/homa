import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LiveRegion } from './LiveRegion';

describe('LiveRegion', () => {
  beforeEach(() => {
    notifications.clean();
  });
  afterEach(() => {
    notifications.clean();
    cleanup();
  });

  test('shows a Mantine notification when toast is true', async () => {
    render(
      <MantineProvider>
        <Notifications />
        <LiveRegion message="Instance settings saved" id={1} toast kind="success" />
      </MantineProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Instance settings saved');
    });
  });

  test('stays polite-only when toast is false', () => {
    render(
      <MantineProvider>
        <Notifications />
        <LiveRegion message="Preview: Dentist" id={2} toast={false} />
      </MantineProvider>,
    );
    expect(screen.getByText('Preview: Dentist')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
