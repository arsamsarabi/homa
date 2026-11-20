import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and channels.
const email = `channels-${Date.now()}@example.com`;

test('add, test, edit and delete a webhook channel @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Chan');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await page.goto('/settings');

  // The CI stack has no SMTP and no private networks allowed: email isn't offered, and a
  // loopback address is refused.
  await page.getByRole('button', { name: 'Add channel' }).click();
  const drawer = page.getByRole('dialog', { name: 'New channel' });
  await expect(drawer.getByLabel(/^Type/).locator('option')).toHaveText(['ntfy', 'Gotify', 'Webhook']);
  await drawer.getByLabel(/^Type/).selectOption('webhook');
  await drawer.getByLabel(/^Address/).fill('https://127.0.0.1/hook');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer.getByRole('alert')).toContainText('private or local networks');

  // A public address (never actually reached here): the secret is shown once.
  await drawer.getByLabel(/^Address/).fill('https://example.com/homa-hook');
  await drawer.getByLabel('Name').fill('My hook');
  await drawer.getByText('Event reminders', { exact: true }).click();
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer.getByLabel('Signing secret')).not.toHaveValue('');
  await drawer.getByRole('button', { name: 'Done' }).click();
  await expect(drawer).toBeHidden();

  const list = page.getByRole('list', { name: 'Notification channels' });
  await expect(list).toContainText('My hook');
  await expect(list).toContainText('Standalone reminders');

  // Rename it; the address is kept.
  await page.getByRole('button', { name: 'Edit "My hook"' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit channel' });
  await expect(edit.getByText('Sends to example.com.', { exact: false })).toBeVisible();
  await edit.getByLabel('Name').fill('Hook');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(list).toContainText('Hook');

  await page
    .getByRole('switch', { name: 'Send to "Hook"' })
    .or(page.getByRole('checkbox', { name: 'Send to "Hook"' }))
    .click();
  await page.getByRole('button', { name: 'Delete "Hook"' }).click();
  await expect(list).not.toContainText('Hook');
});
