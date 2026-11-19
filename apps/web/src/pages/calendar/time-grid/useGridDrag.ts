// Pointer handling for the time grid. The live drag sits in a ref (read by the window listeners)
// and in state (for rendering the ghost); the pure rules live in @/services/time-grid.
import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, useState } from 'react';
import type { Occurrence } from '@/schemas';
import { type Drag, type DragOutcome, dragOutcome, dragTo, type Slot, slotAt } from '@/services/time-grid';

export type GridDrag = {
  drag: Drag | undefined;
  colsRef: RefObject<HTMLDivElement | null>;
  beginCreate: (e: ReactPointerEvent, day: number) => void;
  beginMove: (e: ReactPointerEvent, o: Occurrence) => void;
  beginResize: (e: ReactPointerEvent, o: Occurrence) => void;
};

export function useGridDrag(days: readonly Date[], onDone: (outcome: DragOutcome) => void): GridDrag {
  const colsRef = useRef<HTMLDivElement>(null);
  const live = useRef<Drag>(undefined);
  const [drag, setDrag] = useState<Drag>();
  const update = (d: Drag | undefined): void => {
    live.current = d;
    setDrag(d);
  };

  const slot = (p: { clientX: number; clientY: number }): Slot => {
    const rect = colsRef.current?.getBoundingClientRect();
    return rect ? slotAt(rect, p, days.length, document.dir === 'rtl') : { day: 0, min: 0 };
  };

  function begin(e: ReactPointerEvent, next: Drag): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    update(next);
    const move = (ev: PointerEvent): void => {
      if (live.current) update(dragTo(live.current, slot(ev)));
    };
    const end = (commit: boolean) => (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const d = live.current;
      update(undefined);
      const outcome = commit && d ? dragOutcome(d, days) : undefined;
      if (outcome) onDone(outcome);
    };
    const up = end(true);
    const cancel = end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  return {
    drag,
    colsRef,
    beginCreate: (e: ReactPointerEvent, day: number): void => {
      const p = slot(e);
      begin(e, { kind: 'create', day, from: p.min, to: p.min, moved: false, touch: e.pointerType === 'touch' });
    },
    beginMove: (e: ReactPointerEvent, o: Occurrence): void => {
      // On touch, dragging scrolls; a tap opens the event through its click handler.
      if (e.pointerType === 'touch') {
        e.stopPropagation();
        return;
      }
      const p = slot(e);
      begin(e, { kind: 'move', o, grabDay: p.day, grabMin: p.min, day: p.day, min: p.min, moved: false });
    },
    beginResize: (e: ReactPointerEvent, o: Occurrence): void => {
      if (e.pointerType === 'touch') return;
      const p = slot(e);
      begin(e, { kind: 'resize', o, day: p.day, min: p.min, moved: false });
    },
  };
}
