import { describe, expect, test } from 'bun:test';
import { screen } from '@testing-library/react';
import { json, renderApp, setUpInstance } from '@/testing/renderApp';

const signedOut =
  (signUpsOpen: boolean) =>
  (url: URL): Response =>
    url.pathname === '/api/instance'
      ? json({ ...setUpInstance, name: 'Family', signUpsOpen })
      : url.pathname === '/api/auth/get-session'
        ? json(null)
        : json({ error: `unexpected ${url.pathname}` }, 404);

describe('sign-in page', () => {
  test('shows the instance name and links to sign-up while sign-ups are open', async () => {
    renderApp('/sign-in', signedOut(true));
    expect(await screen.findByText('Family')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create account' })).toBeTruthy();
  });

  test('hides sign-up, and sends the sign-up page back, while sign-ups are closed', async () => {
    renderApp('/sign-up', signedOut(false));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull();
  });
});
