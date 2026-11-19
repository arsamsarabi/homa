import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and events.
const email = `import-${Date.now()}@example.com`;
const pad = (n: number) => String(n).padStart(2, '0');

/** A one-event calendar file for today at 12:00–13:00 UTC. */
function todayIcs(): string {
  const d = new Date();
  const day = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Example//EN',
    'BEGIN:VEVENT',
    `UID:lunch-${Date.now()}@example.com`,
    'SUMMARY:Imported lunch',
    `DTSTART:${day}T120000Z`,
    `DTEND:${day}T130000Z`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

test('import an .ics file and download the data export @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Importer');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await expect(page.getByRole('region', { name: 'Week', exact: true })).toBeVisible();

  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'Import and export' });
  await expect(section.getByRole('combobox', { name: 'Calendar' })).toHaveValue('Personal');
  await section
    .locator('input[type=file]')
    .setInputFiles({ name: 'lunch.ics', mimeType: 'text/calendar', buffer: Buffer.from(todayIcs()) });
  await section.getByRole('button', { name: 'Import' }).click();
  await expect(section.getByText('New events: 1. Updated: 0. Skipped: 0.')).toBeVisible();

  const download = page.waitForEvent('download');
  await section.getByRole('link', { name: 'Download my data (JSON)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^homa-export-\d{4}-\d{2}-\d{2}\.json$/);

  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Week', exact: true }).getByRole('button').filter({ hasText: 'Imported lunch' }),
  ).toBeVisible();
});
