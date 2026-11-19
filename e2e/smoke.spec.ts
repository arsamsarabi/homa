import { expect, test } from '@playwright/test';

// One account per run, so the test also works on an instance that already has users.
const email = `smoke-${Date.now()}@example.com`;
const password = 'correct horse battery';

test('sign up, onboard, see the calendar, switch to Farsi, sign out @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Name').fill('Smoke');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Welcome to Homa, Smoke' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to my calendar' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();

  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitem', { name: 'فارسی' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'خروج' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signing back in works @smoke', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();
});
