// Day and week view data: what goes in the all-day row and each column, the clock, the start scroll.
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHolds } from '@/hooks/polls';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { allDayRowItems, type Placed, type TimedItem, timedColumnItems } from '@/services/calendar-layout';
import { addDays, sameDay } from '@/services/dates';
import { type Occasion, occasionsOn } from '@/services/jalali';
import { type DragOutcome, draftGhost, dragGhost, type Ghost, initialScrollTop } from '@/services/time-grid';
import { instantOf, wallOf } from '@/services/zones';
import { type GridDrag, useGridDrag } from './useGridDrag';

export type TimeGridModel = GridDrag & {
  days: Date[];
  allDay: Occurrence[][];
  columns: Placed<TimedItem>[][];
  ghost: Ghost | undefined;
  /** The placeholder for a new timed event while its editor is open. */
  draft: Ghost | undefined;
  /** Day index of an all-day draft placeholder, when the editor is for an all-day span. */
  allDayDraft: number | undefined;
  /** Persian occasions per day, when the Jalali calendar is on. */
  occasions: Occasion[][];
  /** Tentative holds from open polls, per day, as wall times in the viewed zone. */
  holds: GridHold[][];
  /** Now, as a wall time in the viewed zone. */
  now: Date;
  scrollRef: RefObject<HTMLDivElement | null>;
  open: (o: Occurrence) => void;
  pickDay: (d: Date) => void;
};

export type GridHold = { pollId: string; title: string; start: Date; end: Date };

export function useTimeGrid(): TimeGridModel {
  const { range, tz, secondary, occurrences, editor, actions, pickDay, isReadOnly } = useCalendarPageModel();
  const days = range.days;
  const d = editor.draft;
  const editing = d?.kind === 'edit' ? `${d.occurrence.eventId}\0${d.occurrence.recurrenceId}` : undefined;
  const preview = d?.kind === 'create' ? d : d?.kind === 'edit' ? d.preview : undefined;
  const occ = useMemo((): Occurrence[] | undefined => {
    const list = occurrences.data;
    if (!list || !editing) return list;
    return list.filter((o) => `${o.eventId}\0${o.recurrenceId}` !== editing);
  }, [occurrences.data, editing]);
  const allDay = useMemo((): Occurrence[][] => allDayRowItems(days, occ ?? [], tz), [days, occ, tz]);
  const columns = useMemo((): Placed<TimedItem>[][] => timedColumnItems(days, occ ?? [], tz), [days, occ, tz]);
  const holdList = useHolds(instantOf(range.from, tz), instantOf(range.to, tz)).data;
  const holds = useMemo(
    (): GridHold[][] =>
      days.map((day) =>
        (holdList ?? [])
          .map((h) => ({ ...h, start: wallOf(new Date(h.start), tz), end: wallOf(new Date(h.end), tz) }))
          .filter((h) => h.start < addDays(day, 1) && h.end > day),
      ),
    [days, holdList, tz],
  );
  const occasions = useMemo(
    (): Occasion[][] => days.map((day) => (secondary === 'jalali' ? occasionsOn(day) : [])),
    [days, secondary],
  );

  const onDone = (o: DragOutcome): void => {
    if (o.kind === 'create') editor.openCreate(o.start, o.end, false);
    else if (o.kind === 'open') editor.openEdit(o.o);
    else actions.move(o.o, o.start, o.end);
  };
  const gridDrag = useGridDrag(days, tz, onDone);

  const [instant, setInstant] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setInstant(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = wallOf(instant, tz);

  const draft = preview && !preview.allDay ? draftGhost(preview, days, tz) : undefined;
  const allDayDraft = preview?.allDay
    ? (() => {
        const i = days.findIndex((day) => sameDay(day, preview.start));
        return i >= 0 ? i : undefined;
      })()
    : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: initialScrollTop(days, wallOf(new Date(), tz), el.clientHeight, el.scrollHeight) });
  }, [days, tz]);

  return {
    ...gridDrag,
    // A subscription's events don't move or resize, nor do a poll's: a press opens their details instead.
    beginMove: (e: ReactPointerEvent, o: Occurrence): void => {
      if (!isReadOnly(o.calendarId) && !o.pollId) gridDrag.beginMove(e, o);
      else {
        e.stopPropagation();
        if (e.button === 0 && e.pointerType !== 'touch') editor.openEdit(o);
      }
    },
    beginResize: (e: ReactPointerEvent, o: Occurrence): void => {
      if (!isReadOnly(o.calendarId) && !o.pollId) gridDrag.beginResize(e, o);
    },
    days,
    allDay,
    columns,
    ghost: dragGhost(gridDrag.drag, days, tz),
    draft,
    allDayDraft,
    occasions,
    holds,
    now,
    scrollRef,
    open: editor.openEdit,
    pickDay,
  };
}
