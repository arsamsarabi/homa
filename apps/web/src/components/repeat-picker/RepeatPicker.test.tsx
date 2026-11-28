import { afterEach, describe, expect, mock, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/lib/i18n';
import { RepeatPicker } from './RepeatPicker';

const show = (value: string | null, onChange = mock((_: string | null) => {})): typeof onChange => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <RepeatPicker value={value} onChange={onChange} startDay="MO" />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return onChange;
};
const field = (): HTMLElement => screen.getByRole('button', { name: 'Repeat' });

describe('RepeatPicker', () => {
  afterEach(cleanup);

  test('shows the rule as a sentence; a preset sets it and closes', async () => {
    const onChange = show('FREQ=WEEKLY;INTERVAL=2');
    expect(field().textContent).toBe('Every 2 weeks');
    fireEvent.click(field());
    const twoWeeks = await screen.findByRole('button', { name: 'Every 2 weeks' });
    expect(twoWeeks.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Every month' }));
    expect(onChange).toHaveBeenCalledWith('FREQ=MONTHLY');
    await waitFor(() => expect(field().getAttribute('aria-expanded')).toBe('false'));
  });

  test('your own rule: every N weeks on weekdays, with a preview', async () => {
    const onChange = show(null);
    fireEvent.click(field());
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Wednesday' }));
    expect(screen.getByText('Every 3 weeks on Mon and Wed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,WE');
  });

  test('every N hours, from the unit select', async () => {
    const onChange = show(null);
    fireEvent.click(field());
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'hours' } });
    expect(screen.getByText('Every 4 hours')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChange).toHaveBeenCalledWith('FREQ=HOURLY;INTERVAL=4');
  });

  test('a bad amount shows an error and stays open', async () => {
    const onChange = show(null);
    fireEvent.click(field());
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a whole number of 1 or more.');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('a rule it cannot build shows as a kept custom rule', async () => {
    show('FREQ=MONTHLY;BYDAY=2TU');
    expect(field().textContent).toBe('Custom rule');
    fireEvent.click(field());
    const custom = await screen.findByRole('button', { name: 'Custom rule', hidden: true });
    expect(custom.getAttribute('aria-pressed')).toBe('true');
    expect((custom as HTMLButtonElement).disabled).toBe(true);
  });

  test('Esc closes and gives focus back to the field', async () => {
    show(null);
    fireEvent.click(field());
    const first = await screen.findByRole('button', { name: 'Does not repeat' });
    fireEvent.keyDown(first, { key: 'Escape' });
    await waitFor(() => expect(field().getAttribute('aria-expanded')).toBe('false'));
  });
});
