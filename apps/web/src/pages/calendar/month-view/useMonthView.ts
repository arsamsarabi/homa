// Month view data and the drag that moves an event to another day.
import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { monthCellItems } from '@/services/calendar-layout';
import { isoDate, startOfDay } from '@/services/dates';
import { moveToDay } from '@/services/month-drag';

export const SHOWN_PER_DAY = 3;

export type MonthViewModel = {
  days: Date[];
  month: number;
  cells: Occurrence[][];
  /** The cell a dragged event is over. */
  over: string | undefined;
  beginDrag: (e: ReactPointerEvent, o: Occurrence, day: Date) => void;
  createAt: (day: Date) => void;
  open: (o: Occurrence) => void;
  pickDay: (d: Date) => void;
};

const cellAt = (x: number, y: number): string | undefined =>
  (document.elementFromPoint(x, y)?.closest('[data-date]') as HTMLElement | null)?.dataset.date;

export function useMonthView(): MonthViewModel {
  const { range, date, occurrences, drawer, actions, pickDay } = useCalendarPageModel();
  const occ = occurrences.data;
  const cells = useMemo((): Occurrence[][] => monthCellItems(range.days, occ ?? []), [range.days, occ]);
  const [over, setOver] = useState<string>();
  const grab = useRef<{ o: Occurrence; from: string; moved: boolean }>(undefined);

  function beginDrag(e: ReactPointerEvent, o: Occurrence, day: Date): void {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.stopPropagation();
    grab.current = { o, from: isoDate(day), moved: false };
    const move = (ev: PointerEvent): void => {
      const g = grab.current;
      if (!g) return;
      const at = cellAt(ev.clientX, ev.clientY);
      if (at && at !== g.from) g.moved = true;
      setOver(g.moved ? at : undefined);
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const g = grab.current;
      grab.current = undefined;
      setOver(undefined);
      if (!g) return;
      const at = cellAt(ev.clientX, ev.clientY);
      if (!g.moved || !at) {
        drawer.openEdit(g.o);
        return;
      }
      const { start, end } = moveToDay(g.o, g.from, at);
      actions.move(g.o, start, end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return {
    days: range.days,
    month: date.getMonth(),
    cells,
    over,
    beginDrag,
    createAt: (day: Date): void => {
      const start = startOfDay(day);
      start.setHours(9);
      drawer.openCreate(start, new Date(start.getTime() + 3_600_000), false);
    },
    open: drawer.openEdit,
    pickDay,
  };
}
