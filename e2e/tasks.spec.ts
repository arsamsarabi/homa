import { expect, test } from '@playwright/test';

// Uses its own account, so it runs on an instance that already has users and tasks.
const email = `tasks-${Date.now()}@example.com`;

test('tasks: quick add, lists, projects, tags, subtasks and completing @smoke', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Tasker');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name=password]').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Go to my calendar' }).click();

  // The header links to Tasks, which opens on Today.
  await page.getByRole('link', { name: 'Tasks' }).click();
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByText('Nothing due today.')).toBeVisible();

  // Quick add on Today: no date means due today; a date in the line wins.
  const add = page.getByRole('textbox', { name: 'Add a task' });
  await add.fill('Water the plants');
  await add.press('Enter');
  await expect(today.getByText('Water the plants')).toBeVisible();
  await add.fill('Buy stamps tomorrow');
  await expect(page.getByText('Due Tomorrow')).toBeVisible();
  await add.press('Enter');
  await expect(add).toHaveValue('');
  await expect(today.getByText('Buy stamps')).toBeHidden();
  const nav = page.getByRole('navigation', { name: 'Task lists' });
  await nav.getByRole('link', { name: /Upcoming/ }).click();
  await expect(page.getByRole('region', { name: 'Upcoming' }).getByText('Buy stamps')).toBeVisible();

  // A project, and a task filed in it from its list.
  await nav.getByRole('button', { name: 'New project' }).click();
  const projectDrawer = page.getByRole('dialog', { name: 'New project' });
  await projectDrawer.getByLabel('Name').fill('Garden');
  await projectDrawer.getByRole('button', { name: 'Save' }).click();
  await expect(projectDrawer).toBeHidden();
  await nav.getByRole('link', { name: 'Garden' }).click();
  const garden = page.getByRole('region', { name: 'Garden' });
  await add.fill('Plant bulbs');
  await add.press('Enter');
  await expect(garden.getByText('Plant bulbs')).toBeVisible();

  // Edit it: a tag, high priority and a subtask.
  await garden.getByRole('button', { name: /Plant bulbs/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit task' });
  await drawer.getByLabel('Tags').fill('outdoors');
  await drawer.getByLabel('Tags').press('Enter');
  await drawer.getByLabel('Priority').selectOption('3');
  await drawer.getByRole('textbox', { name: 'Add a subtask' }).fill('Buy compost');
  await drawer.getByRole('textbox', { name: 'Add a subtask' }).press('Enter');
  await expect(drawer.getByRole('checkbox', { name: 'Buy compost' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer).toBeHidden();
  await expect(garden.getByText('High priority')).toBeVisible();
  await expect(garden.getByText('Buy compost')).toBeVisible();

  // The tag has its own list.
  await nav.getByRole('link', { name: '#outdoors' }).click();
  await expect(page.getByRole('region', { name: '#outdoors' }).getByText('Plant bulbs')).toBeVisible();

  // Completing the task completes its subtask; both show under Completed.
  await nav.getByRole('link', { name: 'Garden' }).click();
  await garden.getByRole('checkbox', { name: 'Complete "Plant bulbs"' }).click();
  await expect(garden.getByText('No open tasks in this project.')).toBeVisible();
  await nav.getByRole('link', { name: /Completed/ }).click();
  const done = page.getByRole('region', { name: 'Completed' });
  await expect(done.getByText('Plant bulbs', { exact: true })).toBeVisible();
  await expect(done.getByText('Buy compost')).toBeVisible();

  // Reopening brings it back; deleting the project moves it to the Inbox.
  await done.getByRole('checkbox', { name: 'Mark "Plant bulbs" not done' }).click();
  await expect(done.getByText('Plant bulbs', { exact: true })).toBeHidden();
  await nav.getByRole('link', { name: 'Garden' }).click();
  await page.getByRole('button', { name: 'Edit project' }).click();
  await page.getByRole('dialog', { name: 'Edit project' }).getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByText('Plant bulbs')).toBeVisible();
});
