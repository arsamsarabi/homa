// Shared dismiss path for Esc, overlay click and Close: ask before discarding a dirty form.
import { useCallback, useState } from 'react';

export type UseConfirmClose = {
  markDirty: () => void;
  resetDirty: () => void;
  /** Dismiss, or open the confirm modal when the form is dirty. */
  requestClose: () => void;
  /** Always dismiss (after a successful save). */
  forceClose: () => void;
  asking: boolean;
  discard: () => void;
  keepEditing: () => void;
};

/** Tracks dirty state and gates `onClose` behind a confirm when needed. */
export function useConfirmClose(onClose: () => void): UseConfirmClose {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);

  const markDirty = useCallback((): void => setDirty(true), []);
  const resetDirty = useCallback((): void => {
    setDirty(false);
    setAsking(false);
  }, []);

  const forceClose = useCallback((): void => {
    setDirty(false);
    setAsking(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback((): void => {
    if (!dirty) forceClose();
    else setAsking(true);
  }, [dirty, forceClose]);

  const discard = useCallback((): void => forceClose(), [forceClose]);
  const keepEditing = useCallback((): void => setAsking(false), []);

  return { markDirty, resetDirty, requestClose, forceClose, asking, discard, keepEditing };
}
