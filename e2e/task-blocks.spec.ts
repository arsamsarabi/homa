import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and tasks.
const email = `task-blocks-${Date.now()}@example.com`;
const pad = (n: number): string => String(n).padStart(2, '0');
const localDay = (d = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

test('tasks: reminders, and a time block on the calendar that shows done @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Blocker');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await page.getByRole('link', { name: 'Tasks' }).click();

  const add = page.getByRole('textbox', { name: 'Add a task' });
  await add.fill('Write report');
  await add.press('Enter');
  const today = page.getByRole('region', { name: 'Today' });
  await today.getByRole('button', { name: /Write report/ }).click();

  // A reminder an hour before a 23:30 due.
  const drawer = page.getByRole('dialog', { name: 'Edit task' });
  await drawer.getByLabel('Time', { exact: true }).fill('23:30');
  await drawer.getByLabel('Amount').fill('1');
  await drawer.getByLabel('Unit').selectOption('hours');
  await drawer.getByRole('button', { name: 'Add' }).click();
  await expect(drawer.getByRole('checkbox', { name: '1 hour before' })).toBeChecked();
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer).toBeHidden();
  await expect(today.getByLabel('Has reminders')).toBeVisible();

  // Block an hour this morning on the calendar.
  await today.getByRole('button', { name: /Write report/ }).click();
  await drawer.getByLabel('Day', { exact: true }).fill(localDay());
  await drawer.getByLabel('Starts', { exact: true }).fill('06:00');
  await drawer.getByRole('button', { name: 'Block time' }).click();
  await expect(drawer.getByRole('button', { name: 'Move the block', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(today.getByText(/Blocked Today, 06:00/)).toBeVisible();

  // It's an event on the calendar, struck through once the task is done.
  await today.getByRole('checkbox', { name: 'Complete "Write report"' }).click();
  await expect(today.getByText('Write report')).toBeHidden();
  await page.goto('/');
  const week = page.getByRole('region', { name: 'Week', exact: true });
  await expect(week.getByRole('button', { name: /Write report/ })).toContainText('Task done');
  await expect(week.locator('s', { hasText: 'Write report' })).toBeVisible();
});
