import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and tasks.
const email = `todoist-${Date.now()}@example.com`;
const csv = [
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
  'task,Plant bulbs @outdoors,Tulips by the wall,1,1,Ada (1),,every day,en,,,,,',
  'task,Buy compost,,4,2,Ada (1),,,,,,,,',
].join('\n');

test('import a Todoist project CSV into tasks @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Importer');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();

  await page.goto('/settings?tab=data');
  const section = page.getByRole('region', { name: 'Import from Todoist' });
  await section
    .locator('input[type=file]')
    .setInputFiles({ name: 'Garden.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await section.getByRole('button', { name: 'Import tasks' }).click();
  await expect(section.getByText('Tasks added: 2. Already there: 0. New projects: 1.')).toBeVisible();

  // Due every day, so it's on Today, with its subtask and tag; the project is in the nav.
  await page.getByRole('link', { name: 'Tasks' }).click();
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByText('Plant bulbs')).toBeVisible();
  await expect(today.getByText('High priority')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Task lists' });
  await nav.getByRole('link', { name: 'Garden' }).click();
  await expect(page.getByRole('region', { name: 'Garden' }).getByText('Buy compost')).toBeVisible();
  await expect(nav.getByRole('link', { name: '#outdoors' })).toBeVisible();
});
