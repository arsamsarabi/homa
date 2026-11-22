import { expect, test } from '@playwright/test';
import { type FakeSmtp, linkIn, startFakeSmtp } from '../apps/server/src/testing/fake-smtp';

// Needs a Homa that sends email to a fake SMTP server this spec runs: start the server with
// HOMA_SMTP_URL=smtp://127.0.0.1:$E2E_SMTP_PORT (confirmation is then required by default) and set
// E2E_SMTP_PORT here. Skipped otherwise, as on the CI stack, which has no email.
const smtpPort = Number(process.env.E2E_SMTP_PORT ?? 0);
const email = `emails-${Date.now()}@example.com`;
const password = 'correct horse battery';
const newPassword = 'a whole new password';

let smtp: FakeSmtp;
test.beforeAll(async () => {
  if (smtpPort) smtp = await startFakeSmtp(smtpPort);
});
test.afterAll(async () => {
  await smtp?.stop();
});

test('sign up, confirm the address, then reset the password @smoke', async ({ page }) => {
  test.skip(!smtpPort, 'set E2E_SMTP_PORT, and point the server at it, to run this');
  const mailTo = (from: number): Promise<string> =>
    smtp.waitFor((m) => m.includes(`To: ${email}`), { from, timeoutMs: 10_000 });

  // Sign up: no way in until the address is confirmed.
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Emails');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill(password);
  let from = smtp.mails.length;
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm your email address before you sign in');

  // The link from the sign-up email confirms it and signs in.
  await page.goto(linkIn(await mailTo(from), '/api/auth/verify-email'));
  await expect(page.getByRole('heading', { name: 'Email address confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();
  await page.context().clearCookies();

  // Forgot the password: a reset link sets a new one.
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  from = smtp.mails.length;
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(`If an account uses \u2068${email}\u2069`)).toBeVisible();
  await page.goto(linkIn(await mailTo(from), '/api/auth/reset-password/'));
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password is changed')).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();
});
