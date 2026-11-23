import { expect, test } from '@playwright/test';

// Uses its own accounts. The setup project lets everyone invite (e2e/admin.setup.ts).
const stamp = Date.now();
const ada = `people-ada-${stamp}@example.com`;
const bob = `people-bob-${stamp}@example.com`;

test('invite someone by link, then put them in a circle @smoke', async ({ page, browser }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Ada People');
  await page.getByLabel('Email').fill(ada);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();
  await page.goto('/settings');

  // An invite for Bob's address: no email on the CI stack, so the link is copied by hand.
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const drawer = page.getByRole('dialog', { name: 'Invite someone' });
  await drawer.getByLabel(/^Email/).fill(bob);
  await drawer.getByRole('button', { name: 'Create invite' }).click();
  const link = await drawer.getByLabel('Invite link').inputValue();
  expect(link).toMatch(/\/sign-up\?invite=/);
  await drawer.getByRole('button', { name: 'Done' }).click();
  const invites = page.getByRole('list', { name: 'Invites' });
  await expect(invites).toContainText(bob);
  await expect(invites).toContainText('Open');

  // Bob opens the link in his own browser: the address is fixed to his.
  const other = await browser.newContext();
  const bobPage = await other.newPage();
  await bobPage.goto(link);
  await expect(bobPage.getByText(/Ada People.*invited you/)).toBeVisible();
  await expect(bobPage.getByLabel('Email')).toHaveValue(bob);
  await bobPage.getByLabel('Name').fill('Bob People');
  await bobPage.locator('input[name=password]').fill('correct horse battery');
  await bobPage.getByRole('button', { name: 'Create account' }).click();
  await expect(bobPage.getByRole('button', { name: 'Go to my calendar' })).toBeVisible();
  // The link worked once.
  await bobPage.context().clearCookies();
  await bobPage.goto(link);
  await expect(bobPage.getByText(/expired or has already been used/)).toBeVisible();
  await other.close();

  await page.reload();
  await expect(page.getByRole('list', { name: 'Invites' })).toContainText(/Joined as .?Bob People/);

  // A circle with Bob in it.
  await page.getByRole('button', { name: 'New circle' }).click();
  const circle = page.getByRole('dialog', { name: 'New circle' });
  await circle.getByLabel('Name').fill('Family');
  const picker = circle.getByRole('combobox', { name: 'People' });
  await picker.fill(bob);
  await expect(page.getByRole('listbox', { name: 'People' }).getByRole('option')).toHaveText([`Bob People (${bob})`]);
  await picker.press('ArrowDown');
  await picker.press('Enter');
  await circle.getByLabel('Name').click(); // closes the picker's dropdown
  await circle.getByRole('button', { name: 'Save circle' }).click();
  await expect(circle).toBeHidden();
  const circles = page.getByRole('list', { name: 'Circles' });
  await expect(circles).toContainText('Family');
  await expect(circles).toContainText('Bob People');
});
