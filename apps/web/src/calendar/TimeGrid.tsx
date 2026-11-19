// Day and week views: an all-day row, then a 24-hour grid. Drag on empty space to create, drag an
// event to move it (across days too), drag its bottom edge to resize. Touch taps open or create;
// on touch, dragging scrolls.
import { Text, UnstyledButton } from '@mantine/core';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Occurrence } from './api';
import { addDays, addMinutes, layoutColumns, localSpan, MINUTE, sameDay, snap, startOfDay, touchesDay } from './dates';

export const HOUR_PX = 48;
const DAY_MIN = 24 * 60;
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);

type Props = {
  days: Date[];
  occurrences: Occurrence[];
  colors: Record<string, string>;
  locale: string;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (o: Occurrence) => void;
  onMove: (o: Occurrence, start: Date, end: Date) => void;
  onPickDay: (d: Date) => void;
};

type Drag =
  | { kind: 'create'; day: number; from: number; to: number; moved: boolean; touch: boolean }
  | { kind: 'move'; o: Occurrence; grabDay: number; grabMin: number; day: number; min: number; moved: boolean }
  | { kind: 'resize'; o: Occurrence; day: number; min: number; moved: boolean };

const minutesOf = (d: Date, day: Date) => Math.round((d.getTime() - day.getTime()) / MINUTE);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Long or all-day occurrences go in the all-day row; the rest in the grid. */
const isAllDayRow = (o: Occurrence) =>
  o.allDay || new Date(o.end).getTime() - new Date(o.start).getTime() >= 86_400_000;

export function TimeGrid({ days, occurrences, colors, locale, onCreate, onOpen, onMove, onPickDay }: Props) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>();
  const [now, setNow] = useState(() => new Date());
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const head = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Start scrolled to an hour before now (or 07:00), not midnight.
  useEffect(() => {
    const h = days.some((d) => sameDay(d, new Date())) ? Math.max(0, new Date().getHours() - 1) : 7;
    scroller.current?.scrollTo({ top: h * HOUR_PX });
  }, [days]);

  /** The day column and snapped minute under a pointer. */
  function at(e: { clientX: number; clientY: number }) {
    const r = cols.current?.getBoundingClientRect();
    if (!r) return { day: 0, min: 0 };
    let day = Math.floor(((e.clientX - r.left) / r.width) * days.length);
    if (document.dir === 'rtl') day = days.length - 1 - day;
    return {
      day: clamp(day, 0, days.length - 1),
      min: clamp(snap(((e.clientY - r.top) / HOUR_PX) * 60), 0, DAY_MIN),
    };
  }

  // The live drag sits in a ref (read by the window listeners) and in state (for rendering).
  const live = useRef<Drag>(undefined);
  const update = (d: Drag | undefined) => {
    live.current = d;
    setDrag(d);
  };

  function begin(e: ReactPointerEvent, next: Drag) {
    if (e.button !== 0) return;
    e.stopPropagation();
    update(next);
    const move = (ev: PointerEvent) => {
      const d = live.current;
      if (!d) return;
      const p = at(ev);
      if (d.kind === 'create') {
        if (!d.touch) update({ ...d, to: p.min, moved: d.moved || p.min !== d.from });
      } else {
        update({ ...d, day: p.day, min: p.min, moved: d.moved || p.day !== d.day || p.min !== d.min } as Drag);
      }
    };
    const end = (commit: boolean) => () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const d = live.current;
      update(undefined);
      if (commit && d) finish(d);
    };
    const up = end(true);
    const cancel = end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  function finish(d: Drag) {
    if (d.kind === 'create') {
      const day = days[d.day] as Date;
      const [a, b] = d.moved ? [Math.min(d.from, d.to), Math.max(d.from, d.to)] : [d.from, d.from + 60];
      onCreate(addMinutes(day, a), addMinutes(day, Math.max(b, a + 15)), false);
      return;
    }
    if (!d.moved) return onOpen(d.o);
    const s = new Date(d.o.start);
    const e = new Date(d.o.end);
    if (d.kind === 'move') {
      // Whole days move by calendar day, so 09:00 stays 09:00 across a clock change.
      const ns = addMinutes(addDays(s, d.day - d.grabDay), d.min - d.grabMin);
      onMove(d.o, ns, new Date(ns.getTime() + (e.getTime() - s.getTime())));
    } else {
      const day = days[d.day] as Date;
      const ne = addMinutes(day, d.min);
      onMove(d.o, s, new Date(Math.max(ne.getTime(), addMinutes(s, 15).getTime())));
    }
  }

  const timed = occurrences.filter((o) => !isAllDayRow(o));
  const allDayRow = occurrences.filter(isAllDayRow);

  /** Where the dragged event would land, for the preview block. */
  function preview(): { day: number; from: number; to: number } | undefined {
    if (!drag?.moved) return undefined;
    if (drag.kind === 'create')
      return { day: drag.day, from: Math.min(drag.from, drag.to), to: Math.max(drag.from, drag.to) };
    const s = new Date(drag.o.start);
    const len = (new Date(drag.o.end).getTime() - s.getTime()) / MINUTE;
    if (drag.kind === 'move') {
      const from = minutesOf(s, startOfDay(s)) + (drag.min - drag.grabMin);
      return { day: drag.day, from, to: from + len };
    }
    const day = days.findIndex((d) => sameDay(d, s));
    return {
      day: day < 0 ? drag.day : day,
      from: minutesOf(s, startOfDay(s)),
      to: Math.max(drag.min, minutesOf(s, startOfDay(s)) + 15),
    };
  }
  const ghost = preview();

  return (
    <div className="tg" style={{ '--days': days.length } as React.CSSProperties}>
      <div className="tg-head">
        <div className="tg-gutter" />
        {days.map((d) => (
          <UnstyledButton
            key={d.toISOString()}
            className="tg-dayhead"
            onClick={() => onPickDay(d)}
            aria-current={sameDay(d, now) ? 'date' : undefined}
          >
            {head.format(d)}
          </UnstyledButton>
        ))}
      </div>
      <div className="tg-allday">
        <div className="tg-gutter">
          <Text size="xs" c="dimmed">
            {t('calendar.allDay')}
          </Text>
        </div>
        {days.map((d) => (
          <div key={d.toISOString()} className="tg-allday-cell">
            {allDayRow
              .filter((o) => touchesDay(localSpan(o), d))
              .map((o) => (
                <UnstyledButton
                  key={`${o.eventId}${o.recurrenceId}`}
                  className="ev ev-chip"
                  style={{ '--c': colors[o.calendarId] } as React.CSSProperties}
                  onClick={() => onOpen(o)}
                >
                  {o.summary || t('calendar.untitled')}
                </UnstyledButton>
              ))}
          </div>
        ))}
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body">
          <div className="tg-gutter tg-hours">
            {HOURS.map((h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>
                {time.format(new Date(2000, 0, 1, h))}
              </span>
            ))}
          </div>
          <div className="tg-cols" ref={cols}>
            {days.map((day, di) => {
              const placed = layoutColumns(
                timed.map((o) => ({ o, ...localSpan(o) })).filter((x) => touchesDay(x, day)),
              );
              return (
                <div
                  key={day.toISOString()}
                  className="tg-col"
                  onPointerDown={(e) => {
                    const p = at(e);
                    begin(e, {
                      kind: 'create',
                      day: di,
                      from: p.min,
                      to: p.min,
                      moved: false,
                      touch: e.pointerType === 'touch',
                    });
                  }}
                >
                  {placed.map((p) => {
                    const from = clamp(minutesOf(p.start, day), 0, DAY_MIN);
                    const to = clamp(minutesOf(p.end, day), 0, DAY_MIN);
                    const dragging = drag && drag.kind !== 'create' && drag.moved && drag.o === p.o;
                    return (
                      <button
                        type="button"
                        key={`${p.o.eventId}${p.o.recurrenceId}`}
                        className="ev ev-block"
                        data-dragging={dragging || undefined}
                        style={
                          {
                            '--c': colors[p.o.calendarId],
                            top: (from / 60) * HOUR_PX,
                            height: Math.max(((to - from) / 60) * HOUR_PX, 18),
                            insetInlineStart: `${(p.col / p.cols) * 100}%`,
                            width: `calc(${100 / p.cols}% - 4px)`,
                          } as React.CSSProperties
                        }
                        onPointerDown={(e) => {
                          if (e.pointerType === 'touch') {
                            e.stopPropagation();
                            return;
                          }
                          const g = at(e);
                          begin(e, {
                            kind: 'move',
                            o: p.o,
                            grabDay: g.day,
                            grabMin: g.min,
                            day: g.day,
                            min: g.min,
                            moved: false,
                          });
                        }}
                        onClick={(e) => {
                          // Mouse clicks open through the drag handler; touch taps and the keyboard here.
                          if ((e.nativeEvent as PointerEvent).pointerType === 'touch' || e.detail === 0) onOpen(p.o);
                        }}
                      >
                        <b>{p.o.summary || t('calendar.untitled')}</b>
                        <span>
                          {time.format(p.start)} – {time.format(p.end)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="ev-resize"
                          onPointerDown={(e) => {
                            if (e.pointerType === 'touch') return;
                            const g = at(e);
                            begin(e, { kind: 'resize', o: p.o, day: g.day, min: g.min, moved: false });
                          }}
                        />
                      </button>
                    );
                  })}
                  {ghost?.day === di && (
                    <div
                      className="ev ev-block ev-ghost"
                      style={{ top: (ghost.from / 60) * HOUR_PX, height: ((ghost.to - ghost.from) / 60) * HOUR_PX }}
                    />
                  )}
                  {sameDay(day, now) && (
                    <div className="tg-now" style={{ top: (minutesOf(now, day) / 60) * HOUR_PX }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
