import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, renderApp, signedIn } from '@/testing/renderApp';

const csv = 'TYPE,CONTENT,PRIORITY,INDENT\ntask,Plant bulbs,1,1\n';

describe('Todoist import section', () => {
  test('sends the chosen files with the home zone and shows the summary', async () => {
    const sent: unknown[] = [];
    renderApp('/settings', async (url, req) => {
      if (url.pathname === '/api/tasks/import/todoist') {
        sent.push(await req.json());
        return json({ createdProjects: 2, imported: 7, skipped: 1, unreadDates: 1, sections: 0 });
      }
      return signedIn(url, req);
    });
    const s = await screen.findByRole('region', { name: 'Import from Todoist' });
    const button = within(s).getByRole('button', { name: 'Import tasks' });
    expect(button.hasAttribute('disabled')).toBe(true);
    const input = s.querySelector('input[type=file]');
    if (!input) throw new Error('no file input');
    fireEvent.change(input, {
      target: { files: [new File([csv], 'Garden.csv', { type: 'text/csv' }), new File([csv], 'Home.csv')] },
    });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);

    expect(await within(s).findByText('Tasks added: 7. Already there: 1. New projects: 2.')).toBeTruthy();
    expect(within(s).getByText("1 due date couldn't be read. Its text is in the task's notes.")).toBeTruthy();
    expect(sent).toEqual([
      {
        tz: expect.any(String),
        files: [
          { name: 'Garden.csv', csv },
          { name: 'Home.csv', csv },
        ],
      },
    ]);
  });

  test('shows why an import was refused', async () => {
    renderApp('/settings', (url, req) =>
      url.pathname === '/api/tasks/import/todoist'
        ? json({ error: 'notes.csv: This is not a Todoist CSV export (no TYPE and CONTENT columns)' }, 400)
        : signedIn(url, req),
    );
    const s = await screen.findByRole('region', { name: 'Import from Todoist' });
    const input = s.querySelector('input[type=file]');
    if (!input) throw new Error('no file input');
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.csv')] } });
    fireEvent.click(await within(s).findByRole('button', { name: 'Import tasks' }));
    expect((await within(s).findByRole('alert')).textContent).toContain('notes.csv: This is not a Todoist CSV');
  });
});
