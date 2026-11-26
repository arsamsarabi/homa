import { describe, expect, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { useConfirmClose } from './useConfirmClose';

describe('useConfirmClose', () => {
  test('closes at once when clean', () => {
    let closed = 0;
    const { result } = renderHook(() =>
      useConfirmClose(() => {
        closed += 1;
      }),
    );
    act(() => result.current.requestClose());
    expect(closed).toBe(1);
    expect(result.current.asking).toBe(false);
  });

  test('asks when dirty, then discard closes and keep stays open', () => {
    let closed = 0;
    const { result } = renderHook(() =>
      useConfirmClose(() => {
        closed += 1;
      }),
    );
    act(() => result.current.markDirty());
    act(() => result.current.requestClose());
    expect(closed).toBe(0);
    expect(result.current.asking).toBe(true);
    act(() => result.current.keepEditing());
    expect(result.current.asking).toBe(false);
    act(() => result.current.requestClose());
    act(() => result.current.discard());
    expect(closed).toBe(1);
    expect(result.current.asking).toBe(false);
  });

  test('forceClose skips the ask', () => {
    let closed = 0;
    const { result } = renderHook(() =>
      useConfirmClose(() => {
        closed += 1;
      }),
    );
    act(() => result.current.markDirty());
    act(() => result.current.forceClose());
    expect(closed).toBe(1);
    expect(result.current.asking).toBe(false);
  });
});
