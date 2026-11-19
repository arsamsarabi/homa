import type { CSSProperties, JSX, MouseEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Placed, TimedItem } from '@/services/calendar-layout';
import { minutesFrom, sameDay } from '@/services/dates';
import { blockBox, type Ghost, HOUR_PX, TWO_LINE_PX } from '@/services/time-grid';
import classes from './TimeGrid.module.css';
import type { TimeGridModel } from './useTimeGrid';

type Props = {
  grid: TimeGridModel;
  day: Date;
  index: number;
  items: Placed<TimedItem>[];
  ghost: Ghost | undefined;
  draft: Ghost | undefined;
  colors: Record<string, string>;
  time: Intl.DateTimeFormat;
};

/** One day of the time grid: its events, the drag preview and the now line. */
export function DayColumn({ grid, day, index, items, ghost, draft, colors, time }: Props): JSX.Element {
  const { t } = useTranslation();
  const drag = grid.drag;
  return (
    <div className={classes.col} onPointerDown={(e: PointerEvent<HTMLDivElement>): void => grid.beginCreate(e, index)}>
      {items.map((p) => {
        const box = blockBox(minutesFrom(day, p.start), minutesFrom(day, p.end));
        const dragging = drag !== undefined && drag.kind !== 'create' && drag.moved && drag.o === p.o;
        const style = {
          '--c': colors[p.o.calendarId],
          top: box.top,
          height: box.height,
          insetInlineStart: `${(p.col / p.cols) * 100}%`,
          width: `calc(${100 / p.cols}% - 4px)`,
        } as CSSProperties;
        return (
          <button
            type="button"
            key={`${p.o.eventId}${p.o.recurrenceId}`}
            className={classes.block}
            data-dragging={dragging || undefined}
            data-compact={box.height < TWO_LINE_PX || undefined}
            style={style}
            onPointerDown={(e: PointerEvent<HTMLButtonElement>): void => grid.beginMove(e, p.o)}
            onClick={(e: MouseEvent<HTMLButtonElement>): void => {
              // Mouse clicks open through the drag handler; touch taps and the keyboard open here.
              if ((e.nativeEvent as globalThis.PointerEvent).pointerType === 'touch' || e.detail === 0) grid.open(p.o);
            }}
          >
            <b>{p.o.summary || t('calendar.untitled')}</b>
            <span>
              {time.format(p.start)}
              <span className={classes.end}> – {time.format(p.end)}</span>
            </span>
            <span
              aria-hidden="true"
              className={classes.resize}
              onPointerDown={(e: PointerEvent<HTMLSpanElement>): void => grid.beginResize(e, p.o)}
            />
          </button>
        );
      })}
      {ghost?.day === index && <div className={classes.ghost} style={blockBox(ghost.from, ghost.to)} />}
      {draft?.day === index && (
        <div className={classes.draft} style={blockBox(draft.from, draft.to)} data-draft aria-hidden="true">
          {t('editor.draft')}
        </div>
      )}
      {sameDay(day, grid.now) && (
        <div className={classes.now} style={{ top: (minutesFrom(day, grid.now) / 60) * HOUR_PX }} />
      )}
    </div>
  );
}
