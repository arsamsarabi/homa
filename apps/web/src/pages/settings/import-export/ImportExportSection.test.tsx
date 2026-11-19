import { describe, expect, test } from 'bun:test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type FakeApi, json, renderApp, signedIn } from '@/testing/renderApp';

const calendars = [
  {
    id: 'c1',
    name: 'Personal',
    color: '#4a4e69',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  { id: 'c2', name: 'Work', color: '#22223b', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' },
];
const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';

/** The settings page with these calendars and this answer to an import. */
const api =
  (onImport: (url: URL, req: Request) => Response | Promise<Response>): FakeApi =>
  (url, req) =>
    url.pathname === '/api/calendars'
      ? json(calendars)
      : url.pathname.endsWith('/import')
        ? onImport(url, req)
        : signedIn(url, req);

const section = async (): Promise<HTMLElement> => screen.findByRole('region', { name: 'Import and export' });

function chooseFile(): void {
  const input = document.querySelector('input[type=file]');
  if (!input) throw new Error('no file input');
  fireEvent.change(input, { target: { files: [new File([ics], 'cal.ics', { type: 'text/calendar' })] } });
}

describe('import and export section', () => {
  test('imports into the first calendar and shows the summary with its notes', async () => {
    const sent: { path: string; type: string | null; body: string }[] = [];
    renderApp(
      '/settings',
      api(async (url, req) => {
        sent.push({ path: url.pathname, type: req.headers.get('content-type'), body: await req.text() });
        return json({ imported: 2, updated: 1, skipped: 1, warnings: ['Event "x" skipped: no DTSTART'] });
      }),
    );
    const s = await section();
    const button = within(s).getByRole('button', { name: 'Import' });
    expect(button.hasAttribute('disabled')).toBe(true);
    await waitFor(() =>
      expect((within(s).getByRole('combobox', { name: 'Calendar' }) as HTMLInputElement).value).toBe('Personal'),
    );
    chooseFile();
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);

    expect(await within(s).findByText('New events: 2. Updated: 1. Skipped: 1.')).toBeTruthy();
    expect(within(s).getByText('Event "x" skipped: no DTSTART')).toBeTruthy();
    expect(sent).toEqual([{ path: '/api/calendars/c1/import', type: 'text/calendar', body: ics }]);
  });

  test('shows progress while importing, then the error', async () => {
    let answer: (r: Response) => void = () => undefined;
    renderApp(
      '/settings',
      api(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    const s = await section();
    await waitFor(() =>
      expect((within(s).getByRole('combobox', { name: 'Calendar' }) as HTMLInputElement).value).toBe('Personal'),
    );
    chooseFile();
    fireEvent.click(within(s).getByRole('button', { name: 'Import' }));
    expect(await within(s).findByText('Importing…')).toBeTruthy();
    answer(json({ error: 'Not a valid iCalendar file: expected BEGIN:VCALENDAR' }, 400));
    expect(
      await within(s).findByText("Couldn't import the file: Not a valid iCalendar file: expected BEGIN:VCALENDAR"),
    ).toBeTruthy();
  });

  test('a failed calendar load can be retried; the export is a download link', async () => {
    let fail = true;
    renderApp('/settings', (url, req) =>
      url.pathname === '/api/calendars'
        ? fail
          ? json({ error: 'database is down' }, 500)
          : json(calendars)
        : signedIn(url, req),
    );
    const s = await section();
    expect(await within(s).findByText("Couldn't load your calendars")).toBeTruthy();
    fail = false;
    fireEvent.click(within(s).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect((within(s).getByRole('combobox', { name: 'Calendar' }) as HTMLInputElement).value).toBe('Personal'),
    );
    const link = within(s).getByRole('link', { name: 'Download my data (JSON)' });
    expect(link.getAttribute('href')).toBe('/api/export');
    expect(link.hasAttribute('download')).toBe(true);
  });
});
