// Month view data and the drag that moves an event to another day.
import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { monthCellItems } from '@/services/calendar-layout';
import { isoDate, type Span, wallSpan } from '@/services/dates';
import { type Occasion, occasionsOn } from '@/services/jalali';
import { moveToDay } from '@/services/month-drag';
import { instantOf, wallOf } from '@/services/zones';

export const SHOWN_PER_DAY = 3;

export type MonthViewModel = {
  days: Date[];
  month: number;
  cells: Occurrence[][];
  /** Persian occasions per day, when the Jalali calendar is on. */
  occasions: Occasion[][];
  /** An occurrence's times as wall times in the viewed zone. */
  span: (o: Occurrence) => Span;
  /** The cell a dragged event is over. */
  over: string | undefined;
  /** The day a new event is being created on, for its placeholder. */
  draftDay: string | undefined;
  beginDrag: (e: ReactPointerEvent, o: Occurrence, day: Date) => void;
  createAt: (day: Date) => void;
  open: (o: Occurrence) => void;
  pickDay: (d: Date) => void;
};

const cellAt = (x: number, y: number): string | undefined =>
  (document.elementFromPoint(x, y)?.closest('[data-date]') as HTMLElement | null)?.dataset.date;

export function useMonthView(): MonthViewModel {
  const { range, date, tz, secondary, occurrences, editor, actions, pickDay, isReadOnly } = useCalendarPageModel();
  const occ = occurrences.data;
  const cells = useMemo((): Occurrence[][] => monthCellItems(range.days, occ ?? [], tz), [range.days, occ, tz]);
  const occasions = useMemo(
    (): Occasion[][] => range.days.map((d) => (secondary === 'jalali' ? occasionsOn(d) : [])),
    [range.days, secondary],
  );
  const [over, setOver] = useState<string>();
  const grab = useRef<{ o: Occurrence; from: string; moved: boolean }>(undefined);

  function beginDrag(e: ReactPointerEvent, o: Occurrence, day: Date): void {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.stopPropagation();
    // A subscription's events don't move: a press opens their details instead.
    if (isReadOnly(o.calendarId)) {
      editor.openEdit(o);
      return;
    }
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
        editor.openEdit(g.o);
        return;
      }
      const { start, end } = moveToDay(g.o, g.from, at, tz);
      actions.move(g.o, start, end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const d = editor.draft;
  const draftDay = d?.kind === 'create' ? isoDate(wallOf(d.start, tz)) : undefined;

  return {
    days: range.days,
    month: date.getUTCMonth(),
    cells,
    occasions,
    span: (o: Occurrence): Span => wallSpan(o, tz),
    over,
    draftDay,
    beginDrag,
    createAt: (day: Date): void => {
      // 09:00 on that day in the viewed zone, an hour long.
      const start = instantOf(new Date(day.getTime() + 9 * 3_600_000), tz);
      editor.openCreate(start, new Date(start.getTime() + 3_600_000), false);
    },
    open: editor.openEdit,
    pickDay,
  };
}
