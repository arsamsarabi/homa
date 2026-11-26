import { useCallback, useEffect, useRef, useState } from 'react';
import type { Occurrence } from '@/schemas';
import type { Draft } from '@/services/event-form';

/** What quick add fills in beyond the times. */
export type DraftPrefill = { summary?: string; rrule?: string | null; calendarId?: string };

import type { Box } from '@/services/popover';

export type EventEditorState = {
  draft: Draft | undefined;
  /** What the editor panel sits beside: the clicked event, or undefined to use the draft placeholder. */
  anchor: Box | undefined;
  openCreate: (start: Date, end: Date, allDay: boolean, prefill?: DraftPrefill) => void;
  openEdit: (o: Occurrence) => void;
  /** Keep the calendar draft/preview in sync with the form's times. */
  setTimes: (start: Date, end: Date, allDay: boolean) => void;
  /** Always closes (after save). */
  close: () => void;
  markDirty: () => void;
  /** Esc, overlay, Close, or replacing the draft when dirty. */
  requestClose: () => void;
  confirmClose: boolean;
  confirmDiscard: () => void;
  confirmKeep: () => void;
};

const toBox = (r: DOMRect): Box => ({ top: r.top, left: r.left, width: r.width, height: r.height });

/** Which event the editor is open for, if any, and where it was opened from. */
export function useEventEditor(): EventEditorState {
  const [draft, setDraft] = useState<Draft>();
  const [anchor, setAnchor] = useState<Box>();
  const dirty = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  // The last pointer press, so a mouse or touch open sits beside the event that was pressed.
  const lastPress = useRef<Box | undefined>(undefined);
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      const el = e.target instanceof Element ? e.target.closest('button') : null;
      lastPress.current = el
        ? toBox(el.getBoundingClientRect())
        : { top: e.clientY, left: e.clientX, width: 0, height: 0 };
    };
    const onKey = (): void => {
      lastPress.current = undefined;
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const runOrConfirm = useCallback((action: () => void): void => {
    if (!dirty.current) {
      action();
      return;
    }
    pending.current = action;
    setConfirmClose(true);
  }, []);

  const clearDraft = useCallback((): void => {
    dirty.current = false;
    setDraft(undefined);
    setAnchor(undefined);
  }, []);

  return {
    draft,
    anchor,
    markDirty: (): void => {
      dirty.current = true;
    },
    requestClose: (): void => runOrConfirm(clearDraft),
    confirmClose,
    confirmDiscard: (): void => {
      dirty.current = false;
      setConfirmClose(false);
      const next = pending.current;
      pending.current = null;
      next?.();
    },
    confirmKeep: (): void => {
      pending.current = null;
      setConfirmClose(false);
    },
    openCreate: (start: Date, end: Date, allDay: boolean, prefill?: DraftPrefill): void => {
      runOrConfirm(() => {
        dirty.current = false;
        setAnchor(undefined);
        setDraft({ kind: 'create', start, end, allDay, ...prefill });
      });
    },
    openEdit: (occurrence: Occurrence): void => {
      runOrConfirm(() => {
        dirty.current = false;
        // Keyboard opens have no press; use the focused event instead.
        const focused = document.activeElement;
        setAnchor(
          lastPress.current ?? (focused instanceof HTMLElement ? toBox(focused.getBoundingClientRect()) : undefined),
        );
        setDraft({
          kind: 'edit',
          occurrence,
          preview: { start: new Date(occurrence.start), end: new Date(occurrence.end), allDay: occurrence.allDay },
        });
      });
    },
    setTimes: (start: Date, end: Date, allDay: boolean): void => {
      setDraft((d) => {
        if (!d) return d;
        if (d.kind === 'create') return { ...d, start, end, allDay };
        return { ...d, preview: { start, end, allDay } };
      });
    },
    close: clearDraft,
  };
}
