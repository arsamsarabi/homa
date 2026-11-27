import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { fireEvent, screen } from '@testing-library/react';
import { json, renderApp, signedIn } from '@/testing/renderApp';

const g = globalThis as { PublicKeyCredential?: unknown };
let had: unknown;
beforeEach(() => {
  had = g.PublicKeyCredential;
  g.PublicKeyCredential = class {};
});
afterEach(() => {
  g.PublicKeyCredential = had;
});

describe('settings: security', () => {
  test('a stale session asks to sign in again instead of showing the raw error', async () => {
    renderApp('/settings', (url, req) => {
      if (url.pathname === '/api/auth/passkey/list-user-passkeys') return json([{ id: 'p1', name: 'Laptop' }]);
      if (url.pathname === '/api/auth/passkey/delete-passkey')
        return json({ code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' }, 403);
      return signedIn(url, req);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Please sign in again')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out and sign in again' })).toBeTruthy();
    expect(screen.queryByText(/Session is not fresh/)).toBeNull();
  });
});
