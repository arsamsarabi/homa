import { expect, type Page, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and events.
const email = `calendar-${Date.now()}@example.com`;
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The view switcher's radios are visually hidden; click their labels. */
const pickView = (page: Page, name: string) =>
  page.locator('.mantine-SegmentedControl-root').getByText(name, { exact: true }).click();

/** Event buttons inside one view, found by its accessible name (Day, Week, Month, Agenda, Year). */
const eventsIn = (page: Page, view: string, text: string) =>
  page.getByRole('region', { name: view, exact: true }).getByRole('button').filter({ hasText: text });

async function newEvent(page: Page, title: string, start: string, end: string, repeat?: string) {
  await page.getByRole('button', { name: 'New event' }).click();
  await page.getByPlaceholder('Add a title').fill(title);
  await page.getByLabel('Starts').fill(start);
  await page.getByLabel('Ends').fill(end);
  if (repeat) {
    await page.getByRole('combobox', { name: 'Repeat' }).click();
    await page.getByRole('option', { name: repeat }).click();
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('create, drag, edit a repeating event and switch views @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Cal');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'Go to my calendar' }).click();
  await expect(page.getByRole('region', { name: 'Week', exact: true })).toBeVisible();

  // Create today 10:00–11:00, then drag it two hours later and stretch it by half an hour.
  const today = localDay();
  await newEvent(page, 'Dentist', `${today}T10:00`, `${today}T11:00`);
  const block = eventsIn(page, 'Week', 'Dentist');
  await expect(block).toContainText('10:00');
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  if (!box) throw new Error('no event block');
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 10 + 96, { steps: 6 });
  await page.mouse.up();
  await expect(block).toContainText('12:00');

  await block.scrollIntoViewIfNeeded();
  const moved = await block.boundingBox();
  if (!moved) throw new Error('no event block');
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 2 + 24, { steps: 4 });
  await page.mouse.up();
  await expect(block).toContainText('13:30');

  // A weekly event: change one occurrence only, then cut the series from the second week.
  // Starting on the 1st keeps at least four weeks of it in this month's grid.
  const first = `${today.slice(0, 8)}01`;
  await newEvent(page, 'Gym', `${first}T07:00`, `${first}T08:00`, 'Every week');
  await pickView(page, 'Month');
  const gyms = eventsIn(page, 'Month', 'Gym');
  await expect.poll(() => gyms.count()).toBeGreaterThanOrEqual(4);
  const gymCount = await gyms.count();

  await gyms.first().click();
  await page.getByPlaceholder('Add a title').fill('Gym with Leo');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'This event', exact: true }).click();
  const plainGyms = gyms.filter({ hasNotText: 'Leo' });
  await expect(eventsIn(page, 'Month', 'Gym with Leo')).toHaveCount(1);
  await expect(plainGyms).toHaveCount(gymCount - 1);

  await plainGyms.first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'This and following events' }).click();
  await expect(plainGyms).toHaveCount(0);
  await expect(eventsIn(page, 'Month', 'Gym with Leo')).toHaveCount(1);

  // The other views render and link back to a day.
  await pickView(page, 'Agenda');
  await expect(eventsIn(page, 'Agenda', 'Dentist')).toBeVisible();
  await pickView(page, 'Year');
  await page.getByRole('region', { name: 'Year', exact: true }).locator('button[aria-current=date]').click();
  await expect(page).toHaveURL(/view=day/);
  await expect(eventsIn(page, 'Day', 'Dentist')).toBeVisible();
});
