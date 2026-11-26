// The email confirmation and password reset pages, with the API faked at the fetch boundary.
import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, renderApp, sessionBody, setUpInstance } from '@/testing/renderApp';

type Sent = { path: string; body: Record<string, unknown> };

/** Signed out (or signed in, with `session`), recording POSTs; `answers` overrides any path. */
function fakeApi(opts: { passwordReset?: boolean; session?: boolean; answers?: Record<string, () => Response> } = {}) {
  const sent: Sent[] = [];
  const api = async (url: URL, req: Request): Promise<Response> => {
    if (req.method === 'POST') sent.push({ path: url.pathname, body: (await req.json()) as Record<string, unknown> });
    const answer = opts.answers?.[url.pathname];
    if (answer) return answer();
    if (url.pathname === '/api/instance') return json({ ...setUpInstance, passwordReset: opts.passwordReset ?? true });
    if (url.pathname === '/api/auth/get-session') return json(opts.session ? sessionBody() : null);
    if (req.method === 'POST') return json({ status: true });
    return json({ error: `unexpected ${url.pathname}` }, 404);
  };
  return { api, sent };
}

const fill = (label: RegExp, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('sign-in', () => {
  test('links to the reset page when the server can send email', async () => {
    renderApp('/sign-in', fakeApi().api);
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toBeTruthy();
  });

  test('without email, says to ask the admin instead', async () => {
    renderApp('/sign-in', fakeApi({ passwordReset: false }).api);
    expect(await screen.findByText(/Ask the admin of this Homa to reset it/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).toBeNull();
  });

  test('an unconfirmed address is told a new link is on its way', async () => {
    const { api } = fakeApi({
      answers: {
        '/api/auth/sign-in/email': () => json({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, 403),
      },
    });
    renderApp('/sign-in', api);
    await screen.findByRole('heading', { name: 'Sign in' });
    fill(/^Email/, 'bob@example.com');
    fill(/^Password/, 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('bob@example.com');
  });
});

describe('sign-up with confirmation', () => {
  test('ends on "check your email", and can send the link again', async () => {
    const user = { ...(sessionBody() as { user: object }).user, emailVerified: false };
    const { api, sent } = fakeApi({ answers: { '/api/auth/sign-up/email': () => json({ token: null, user }) } });
    renderApp('/sign-up', api);
    await screen.findByRole('heading', { name: 'Create your account' });
    fill(/^Name/, 'Bob');
    fill(/^Email/, 'bob@example.com');
    fill(/^Password/, 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText(/We sent a link to .bob@example.com./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    expect((await screen.findByRole('status')).textContent).toBe('A new link is on its way.');
    expect(sent.at(-1)).toEqual({
      path: '/api/auth/send-verification-email',
      body: { email: 'bob@example.com', callbackURL: '/verify-email' },
    });
  });
});

describe('forgot password', () => {
  test('sends the reset link request and says the same thing for any address', async () => {
    const { api, sent } = fakeApi();
    renderApp('/forgot-password', api);
    await screen.findByRole('heading', { name: 'Reset your password' });
    fill(/^Email/, 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account uses .ada@example.com., a reset link is on its way/)).toBeTruthy();
    expect(sent).toEqual([
      { path: '/api/auth/request-password-reset', body: { email: 'ada@example.com', redirectTo: '/reset-password' } },
    ]);
  });

  test('without email, says to ask the admin', async () => {
    renderApp('/forgot-password', fakeApi({ passwordReset: false }).api);
    expect(await screen.findByText(/This Homa can't send email/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send reset link' })).toBeNull();
  });
});

describe('reset password', () => {
  test('sets the new password with the link’s token', async () => {
    const { api, sent } = fakeApi();
    renderApp('/reset-password?token=tok123', api);
    await screen.findByRole('heading', { name: 'Choose a new password' });
    fill(/^New password/, 'a whole new one');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText(/Your password is changed/)).toBeTruthy();
    expect(sent).toEqual([
      { path: '/api/auth/reset-password', body: { newPassword: 'a whole new one', token: 'tok123' } },
    ]);
  });

  test('an expired or used link asks for a new one', async () => {
    renderApp('/reset-password?error=INVALID_TOKEN', fakeApi().api);
    expect(await screen.findByText(/This link has expired or was already used/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Send a new link' }).getAttribute('href')).toBe('/forgot-password');
  });

  test('a link that runs out before saving asks for a new one too', async () => {
    const { api } = fakeApi({
      answers: { '/api/auth/reset-password': () => json({ code: 'INVALID_TOKEN', message: 'Invalid token' }, 400) },
    });
    renderApp('/reset-password?token=old', api);
    await screen.findByRole('heading', { name: 'Choose a new password' });
    fill(/^New password/, 'a whole new one');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText(/This link has expired or was already used/)).toBeTruthy();
  });
});

describe('verify email', () => {
  test('confirmed and signed in: goes on to the welcome step', async () => {
    renderApp('/verify-email', fakeApi({ session: true }).api);
    expect(await screen.findByRole('heading', { name: 'Email address confirmed' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/onboarding');
  });

  test('an expired link offers a new one', async () => {
    const { api, sent } = fakeApi();
    renderApp('/verify-email?error=TOKEN_EXPIRED', api);
    expect(await screen.findByText(/This confirmation link has expired/)).toBeTruthy();
    fill(/^Email/, 'bob@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    await waitFor(() => expect(sent.at(-1)?.path).toBe('/api/auth/send-verification-email'));
  });
});

describe('setup with confirmation required', () => {
  test('the admin, confirmed at sign-up, is signed in straight after', async () => {
    const admin = { ...(sessionBody('admin') as { user: object }).user, emailVerified: true };
    const { api, sent } = fakeApi({
      answers: {
        '/api/instance': () => json({ ...setUpInstance, needsSetup: true }),
        '/api/auth/sign-up/email': () => json({ token: null, user: admin }),
        '/api/auth/sign-in/email': () => json({ token: 't', user: admin }),
      },
    });
    renderApp('/setup', api);
    fireEvent.change(await screen.findByLabelText(/^Setup code/), { target: { value: '4321' } });
    fill(/^Name/, 'Ada');
    fill(/^Email/, 'ada@example.com');
    fill(/^Password/, 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));
    await waitFor(() =>
      expect(sent.map((s) => s.path)).toEqual(['/api/auth/sign-up/email', '/api/auth/sign-in/email']),
    );
  });
});
