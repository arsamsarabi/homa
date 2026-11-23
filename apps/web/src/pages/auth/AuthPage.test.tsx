import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

describe('sign-up with an invite', () => {
  test('opens while sign-ups are closed, says who invited, fixes the address and sends the token', async () => {
    const sent: Request[] = [];
    renderApp('/sign-up?invite=tok123', async (url, req) => {
      if (url.pathname === '/api/invite-lookup') {
        expect(url.searchParams.get('token')).toBe('tok123');
        return json({ instanceName: 'Family', invitedBy: 'Ada', email: 'bob@example.com' });
      }
      if (url.pathname === '/api/auth/sign-up/email') {
        sent.push(req);
        return json({ message: 'stop here' }, 400);
      }
      return signedOut(false)(url);
    });
    expect(await screen.findByText(/Ada.*invited you to.*Family/)).toBeTruthy();
    const email = screen.getByLabelText(/Email/) as HTMLInputElement;
    expect(email.value).toBe('bob@example.com');
    expect(email.readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Bob' } });
    fireEvent.change(document.querySelector('input[name=password]') as Element, {
      target: { value: 'correct horse battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.headers.get('x-homa-invite')).toBe('tok123');
  });

  test('says when the link no longer works', async () => {
    renderApp('/sign-up?invite=old', (url) =>
      url.pathname === '/api/invite-lookup' ? json({ error: 'Not found' }, 404) : signedOut(false)(url),
    );
    expect(await screen.findByText(/expired or has already been used/)).toBeTruthy();
  });
});
