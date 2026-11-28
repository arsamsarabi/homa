import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and events.
const email = `reminders-${Date.now()}@example.com`;
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

test('event reminders, standalone reminders and the bell @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Rem');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await expect(page.getByRole('region', { name: 'Week', exact: true })).toBeVisible();

  // A new timed event starts with the default reminder; add another and save.
  const today = localDay();
  await page.getByRole('button', { name: 'New event' }).click();
  await page.getByPlaceholder('Add a title').fill('Dentist');
  await page.getByLabel('Starts').fill(`${today}T10:00`);
  await page.getByLabel('Ends').fill(`${today}T11:00`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Remove 10 minutes before' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add reminder' }).click();
  await dialog.getByLabel('Amount').fill('1');
  await dialog.getByLabel('Unit').selectOption('hours');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove 1 hour before' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // Reopened, it has both; dropping one saves the change.
  const block = page
    .getByRole('region', { name: 'Week', exact: true })
    .getByRole('button')
    .filter({ hasText: 'Dentist' });
  await block.click();
  await expect(dialog.getByRole('button', { name: 'Remove 1 hour before' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove 10 minutes before' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove 10 minutes before' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await block.click();
  await expect(dialog.getByRole('button', { name: 'Remove 1 hour before' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove 10 minutes before' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The bell starts empty and links to the reminders page.
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await page.getByRole('link', { name: 'Manage reminders' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();

  // A standalone reminder, daily.
  await page.getByRole('button', { name: 'New reminder' }).click();
  const drawer = page.getByRole('dialog', { name: 'New reminder' });
  await drawer.getByLabel('What to remind you of').fill('Pills');
  await drawer.getByLabel(/^When/).fill('2030-01-01T09:00');
  await drawer.getByRole('button', { name: 'Repeat', exact: true }).click();
  await drawer.getByRole('button', { name: 'Every day', exact: true }).click();
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer).toBeHidden();
  const list = page.getByRole('list', { name: 'Reminders' });
  await expect(list).toContainText('Pills');
  await expect(list).toContainText('Every day');
  await page.getByRole('button', { name: 'Delete "Pills"' }).click();
  await expect(list).not.toContainText('Pills');
});
