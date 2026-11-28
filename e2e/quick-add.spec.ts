import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and events.
const email = `quick-add-${Date.now()}@example.com`;

test('quick add creates an event and opens the editor prefilled @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Quick');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await expect(page.getByRole('region', { name: 'Week', exact: true })).toBeVisible();

  // "Q" focuses quick add; the preview shows what Enter will create.
  await page.keyboard.press('q');
  const box = page.getByRole('textbox', { name: 'Quick add' });
  await expect(box).toBeFocused();
  await box.fill('Dentist tomorrow 3pm 45m');
  await expect(page.getByTestId('quick-add-preview')).toContainText('45 min');
  await expect(page.getByTestId('quick-add-preview')).toContainText('15:00');
  await box.press('Enter');
  await expect(box).toHaveValue('');
  const dentist = page
    .getByRole('region', { name: 'Week', exact: true })
    .getByRole('button')
    .filter({ hasText: 'Dentist' });
  await expect(dentist).toContainText('15:00');

  // Shift+Enter opens the full editor with the title and repeat filled in.
  await box.fill('Team sync every Monday 10am');
  await box.press('Shift+Enter');
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await expect(dialog).toBeVisible();
  await expect(page.getByPlaceholder('Add a title')).toHaveValue('Team sync');
  await expect(dialog.getByRole('button', { name: 'Repeat', exact: true })).toHaveText('Every week');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  // The next Monday may be in the next week; the agenda shows the coming 30 days.
  await page.getByRole('combobox', { name: 'View' }).click();
  await page.getByRole('option', { name: 'Agenda', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Agenda', exact: true }).getByText('Team sync').first()).toBeVisible();
});
