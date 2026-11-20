import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and events.
const email = `calendars-${Date.now()}@example.com`;
const pad = (n: number) => String(n).padStart(2, '0');
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

test('recolor a calendar in Settings, then hide and show it with the filter', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Filter');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  const week = page.getByRole('region', { name: 'Week', exact: true });
  await expect(week).toBeVisible();

  await page.getByRole('button', { name: 'New event' }).click();
  await page.getByPlaceholder('Add a title').fill('Swim');
  await page.getByLabel('Starts').fill(`${today}T10:00`);
  await page.getByLabel('Ends').fill(`${today}T11:00`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const swim = week.getByRole('button').filter({ hasText: 'Swim' });
  await expect(swim).toBeVisible();

  // Settings → Calendars: pick a suggested color for Personal.
  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'Calendars', exact: true });
  await section.getByRole('button', { name: 'Color of Personal' }).click();
  await page.getByRole('button', { name: '#3b9492' }).click();
  await page.keyboard.press('Escape');

  // The event takes the new color.
  await page.goto('/');
  await expect(swim).toBeVisible();
  await expect(swim).toHaveAttribute('style', /--c:\s*#3b9492/i);

  // Hide Personal: the event leaves the view, the button counts it, and it stays hidden after a reload.
  await page.getByRole('button', { name: 'Calendars', exact: true }).click();
  const personal = page.getByRole('checkbox', { name: 'Personal' });
  // A click, not uncheck(): the box follows the saved state, which updates a tick after the click.
  await personal.click();
  await expect(personal).not.toBeChecked();
  await expect(swim).toBeHidden();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Calendars, 1 hidden' })).toBeVisible();
  await expect(week).toBeVisible();
  await expect(swim).toBeHidden();

  await page.getByRole('button', { name: 'Calendars, 1 hidden' }).click();
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(swim).toBeVisible();
});
