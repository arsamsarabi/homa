import { VisuallyHidden } from '@mantine/core';
import type { CSSProperties, JSX, MouseEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { addedByName, useCalendarPageModel, useMyId } from '@/pages/calendar/model';
import type { Placed, TimedItem } from '@/services/calendar-layout';
import { occurrenceTitle } from '@/services/calendar-sharing';
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
  /** Live title for the dashed create/edit ghost. */
  draftTitle: string;
  colors: Record<string, string>;
  time: Intl.DateTimeFormat;
};

/** One day of the time grid: its events, the drag preview and the now line. */
export function DayColumn({ grid, day, index, items, ghost, draft, draftTitle, colors, time }: Props): JSX.Element {
  const { t } = useTranslation();
  const { accessOf, isReadOnly } = useCalendarPageModel();
  const me = useMyId();
  const drag = grid.drag;
  const labels = { busy: t('calendar.busy'), untitled: t('calendar.untitled') };
  return (
    <div className={classes.col} onPointerDown={(e: PointerEvent<HTMLDivElement>): void => grid.beginCreate(e, index)}>
      {items.map((p) => {
        const box = blockBox(minutesFrom(day, p.start), minutesFrom(day, p.end));
        const dragging = drag !== undefined && drag.kind !== 'create' && drag.moved && drag.o === p.o;
        const access = accessOf(p.o.calendarId);
        const readOnly = isReadOnly(p.o.calendarId);
        const by = addedByName(p.o, me);
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
            data-freebusy={access === 'freebusy' || undefined}
            data-readonly={readOnly || undefined}
            style={style}
            onPointerDown={(e: PointerEvent<HTMLButtonElement>): void => grid.beginMove(e, p.o)}
            onClick={(e: MouseEvent<HTMLButtonElement>): void => {
              // Mouse clicks open through the drag handler; touch taps and the keyboard open here.
              if ((e.nativeEvent as globalThis.PointerEvent).pointerType === 'touch' || e.detail === 0) grid.open(p.o);
            }}
          >
            <b>
              {p.o.taskDone ? (
                <s>{occurrenceTitle(p.o.summary, access, labels)}</s>
              ) : (
                occurrenceTitle(p.o.summary, access, labels)
              )}
              {p.o.taskDone && <VisuallyHidden>{t('calendar.taskDone')}</VisuallyHidden>}
            </b>
            <span>
              {time.format(p.start)}
              <span className={classes.end}> – {time.format(p.end)}</span>
            </span>
            {by && <span className={classes.end}>{t('editor.addedBy', { name: by })}</span>}
            {!readOnly && (
              <span
                aria-hidden="true"
                className={classes.resize}
                onPointerDown={(e: PointerEvent<HTMLSpanElement>): void => grid.beginResize(e, p.o)}
              />
            )}
          </button>
        );
      })}
      {ghost?.day === index && <div className={classes.ghost} style={blockBox(ghost.from, ghost.to)} />}
      {draft?.day === index && (
        <div className={classes.draft} style={blockBox(draft.from, draft.to)} data-draft aria-hidden="true">
          {draftTitle}
        </div>
      )}
      {sameDay(day, grid.now) && (
        <div className={classes.now} style={{ top: (minutesFrom(day, grid.now) / 60) * HOUR_PX }} />
      )}
    </div>
  );
}
