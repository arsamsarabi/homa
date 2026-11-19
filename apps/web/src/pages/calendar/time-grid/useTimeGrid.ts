// Day and week view data: what goes in the all-day row and each column, the clock, the start scroll.
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { allDayRowItems, type Placed, type TimedItem, timedColumnItems } from '@/services/calendar-layout';
import { type Occasion, occasionsOn } from '@/services/jalali';
import { type DragOutcome, dragGhost, type Ghost, HOUR_PX, initialScrollHour } from '@/services/time-grid';
import { wallOf } from '@/services/zones';
import { type GridDrag, useGridDrag } from './useGridDrag';

export type TimeGridModel = GridDrag & {
  days: Date[];
  allDay: Occurrence[][];
  columns: Placed<TimedItem>[][];
  ghost: Ghost | undefined;
  /** Persian occasions per day, when the Jalali calendar is on. */
  occasions: Occasion[][];
  /** Now, as a wall time in the viewed zone. */
  now: Date;
  scrollRef: RefObject<HTMLDivElement | null>;
  open: (o: Occurrence) => void;
  pickDay: (d: Date) => void;
};

export function useTimeGrid(): TimeGridModel {
  const { range, tz, secondary, occurrences, drawer, actions, pickDay } = useCalendarPageModel();
  const days = range.days;
  const occ = occurrences.data;
  const allDay = useMemo((): Occurrence[][] => allDayRowItems(days, occ ?? [], tz), [days, occ, tz]);
  const columns = useMemo((): Placed<TimedItem>[][] => timedColumnItems(days, occ ?? [], tz), [days, occ, tz]);
  const occasions = useMemo(
    (): Occasion[][] => days.map((d) => (secondary === 'jalali' ? occasionsOn(d) : [])),
    [days, secondary],
  );

  const onDone = (o: DragOutcome): void => {
    if (o.kind === 'create') drawer.openCreate(o.start, o.end, false);
    else if (o.kind === 'open') drawer.openEdit(o.o);
    else actions.move(o.o, o.start, o.end);
  };
  const gridDrag = useGridDrag(days, tz, onDone);

  const [instant, setInstant] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setInstant(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = wallOf(instant, tz);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: initialScrollHour(days, wallOf(new Date(), tz)) * HOUR_PX });
  }, [days, tz]);

  return {
    ...gridDrag,
    days,
    allDay,
    columns,
    ghost: dragGhost(gridDrag.drag, days, tz),
    occasions,
    now,
    scrollRef,
    open: drawer.openEdit,
    pickDay,
  };
}
