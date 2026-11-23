import { expect, test } from '@playwright/test';

// Runs before the other specs (a Playwright setup project). On a new instance the first visitor
// sets it up as its admin; on one that already has users there's nothing to do.
test('set up a new instance as its admin @smoke', async ({ page, request }) => {
  const instance = (await (await request.get('/api/instance')).json()) as { needsSetup: boolean };
  test.skip(!instance.needsSetup, 'this instance is already set up');

  // The code the server printed in its log at start (CI reads it from the container log).
  const code = process.env.HOMA_SETUP_CODE;
  expect(code, 'set HOMA_SETUP_CODE to the first-run setup code from the server log').toMatch(/^\d{4}$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('Setup code').fill('0000' === code ? '0001' : '0000');
  await page.getByLabel('Name').fill('Admin');
  await page.getByLabel('Email').fill(`admin-${Date.now()}@example.com`);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await expect(page.getByRole('alert')).toContainText('setup code');
  await page.getByLabel('Setup code').fill(code as string);
  await page.getByRole('button', { name: 'Create admin account' }).click();

  // Instance settings: rename it and leave sign-ups open, so the other specs can sign up.
  const name = page.getByRole('textbox', { name: 'Instance name' });
  await expect(name).toHaveValue('Homa');
  await name.fill('E2E Homa');
  await expect(page.getByLabel('Anyone who can reach this Homa')).toBeChecked();
  // Let everyone invite, so e2e/people.spec.ts can invite without the admin's account.
  await page.getByLabel('Everyone with an account').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText(/Now your own settings/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Go to my calendar' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();

  // The admin finds the instance settings again from their own settings.
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Change the instance settings' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('textbox', { name: 'Instance name' })).toHaveValue('E2E Homa');
});
