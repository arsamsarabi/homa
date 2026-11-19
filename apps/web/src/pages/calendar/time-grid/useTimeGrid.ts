// Day and week view data: what goes in the all-day row and each column, the clock, the start scroll.
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { allDayRowItems, type Placed, type TimedItem, timedColumnItems } from '@/services/calendar-layout';
import { type DragOutcome, dragGhost, type Ghost, HOUR_PX, initialScrollHour } from '@/services/time-grid';
import { type GridDrag, useGridDrag } from './useGridDrag';

export type TimeGridModel = GridDrag & {
  days: Date[];
  allDay: Occurrence[][];
  columns: Placed<TimedItem>[][];
  ghost: Ghost | undefined;
  now: Date;
  scrollRef: RefObject<HTMLDivElement | null>;
  open: (o: Occurrence) => void;
  pickDay: (d: Date) => void;
};

export function useTimeGrid(): TimeGridModel {
  const { range, occurrences, drawer, actions, pickDay } = useCalendarPageModel();
  const days = range.days;
  const occ = occurrences.data;
  const allDay = useMemo((): Occurrence[][] => allDayRowItems(days, occ ?? []), [days, occ]);
  const columns = useMemo((): Placed<TimedItem>[][] => timedColumnItems(days, occ ?? []), [days, occ]);

  const onDone = (o: DragOutcome): void => {
    if (o.kind === 'create') drawer.openCreate(o.start, o.end, false);
    else if (o.kind === 'open') drawer.openEdit(o.o);
    else actions.move(o.o, o.start, o.end);
  };
  const gridDrag = useGridDrag(days, onDone);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: initialScrollHour(days, new Date()) * HOUR_PX });
  }, [days]);

  return {
    ...gridDrag,
    days,
    allDay,
    columns,
    ghost: dragGhost(gridDrag.drag, days),
    now,
    scrollRef,
    open: drawer.openEdit,
    pickDay,
  };
}
