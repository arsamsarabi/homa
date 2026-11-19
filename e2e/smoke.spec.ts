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
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();

  // Keyboard: M shows the month, the palette opens settings, and the back link returns.
  await page.keyboard.press('m');
  await expect(page.getByRole('region', { name: 'Month', exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Type a command…').fill('settings');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('link', { name: 'Back to the calendar' }).click();
  await expect(page.getByRole('region', { name: 'Week', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'فارسی' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'منوی حساب' }).click();
  await page.getByRole('menuitem', { name: 'خروج' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signing back in works @smoke', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('[aria-current=date]')).toBeVisible();
});
