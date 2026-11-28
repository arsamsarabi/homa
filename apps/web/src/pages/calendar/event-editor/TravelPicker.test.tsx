import { afterEach, describe, expect, mock, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@/lib/i18n';
import { TravelPicker } from './TravelPicker';

const show = (value: number | null): ReturnType<typeof mock> => {
  const onChange = mock((_: number | null) => {});
  render(
    <MantineProvider>
      <TravelPicker value={value} onChange={onChange} />
    </MantineProvider>,
  );
  return onChange;
};
const field = (): HTMLElement => screen.getByRole('button', { name: 'Travel time' });

describe('TravelPicker', () => {
  afterEach(cleanup);

  test('an off-list value shows checked among the presets', async () => {
    show(45);
    expect(field().textContent).toBe('45 min travel time');
    fireEvent.click(field());
    expect((await screen.findByRole('button', { name: '45 min' })).getAttribute('aria-pressed')).toBe('true');
  });

  test('your own hours, up to 24', async () => {
    const onChange = show(null);
    fireEvent.click(field());
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'hours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Up to 24 hours.');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } });
    expect(screen.getByText('2 hr travel time')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChange).toHaveBeenCalledWith(120);
  });
});
