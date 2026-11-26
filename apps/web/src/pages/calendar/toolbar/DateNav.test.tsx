import { describe, expect, mock, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { DateNav } from './DateNav';

const wrap = (ui: ReactNode): JSX.Element => <MantineProvider>{ui}</MantineProvider>;

describe('DateNav', () => {
  test('exposes previous and next and calls them', () => {
    const previous = mock(() => {});
    const next = mock(() => {});
    render(
      wrap(
        <DateNav
          title="November 2026"
          secondaryTitle="Azar 1405 AP"
          previousLabel="Previous"
          nextLabel="Next"
          onPrevious={previous}
          onNext={next}
        />,
      ),
    );
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.getByText('Azar 1405 AP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(previous).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('omits the secondary line when unset', () => {
    render(
      wrap(
        <DateNav
          title="November 2026"
          previousLabel="Previous"
          nextLabel="Next"
          onPrevious={() => {}}
          onNext={() => {}}
        />,
      ),
    );
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.queryByText('Azar 1405 AP')).toBeNull();
  });
});
