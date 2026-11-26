// Day and week views: an all-day row, then a 24-hour grid. Drag on empty space to create, drag an
// event to move it (across days too), drag its bottom edge to resize. On touch, taps open or
// create and dragging scrolls.
import { Text, UnstyledButton } from '@mantine/core';
import type { CSSProperties, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { EventChip } from '@/components';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { occurrenceTitle } from '@/services/calendar-sharing';
import { sameDay } from '@/services/dates';
import { draftLabel } from '@/services/event-form';
import { HOUR_PX } from '@/services/time-grid';
import { DayColumn } from './DayColumn';
import classes from './TimeGrid.module.css';
import { useTimeGrid } from './useTimeGrid';

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);

export function TimeGrid(): JSX.Element {
  const { t } = useTranslation();
  const { view, formats, colors, secondary, editor, accessOf } = useCalendarPageModel();
  const grid = useTimeGrid();
  const draftTitle = editor.draft ? draftLabel(editor.draft, t('calendar.untitled')) : t('calendar.untitled');
  const labels = { busy: t('calendar.busy'), untitled: t('calendar.untitled') };

  return (
    <section
      aria-label={t(`calendar.views.${view}`)}
      className={classes.grid}
      style={{ '--days': grid.days.length } as CSSProperties}
    >
      <div className={classes.head}>
        <div />
        {grid.days.map((d, i) => (
          <UnstyledButton
            key={d.toISOString()}
            className={classes.dayHead}
            onClick={() => grid.pickDay(d)}
            aria-current={sameDay(d, grid.now) ? 'date' : undefined}
          >
            {formats.dayHeader.format(d)}
            {secondary === 'jalali' && <span className={classes.jalali}>{formats.jalaliDayMonth.format(d)}</span>}
            {grid.occasions[i]?.map((o) => (
              <span key={o} className={classes.occasion}>
                {t(`occasions.${o}`)}
              </span>
            ))}
          </UnstyledButton>
        ))}
      </div>
      <div className={classes.allDay}>
        <div className={classes.allDayLabel}>
          <Text size="xs" c="dimmed">
            {t('calendar.allDay')}
          </Text>
        </div>
        {grid.days.map((d, i) => (
          <div key={d.toISOString()} className={classes.allDayCell}>
            {grid.allDayDraft === i && (
              <div className={classes.allDayDraft} data-draft aria-hidden="true">
                {draftTitle}
              </div>
            )}
            {grid.allDay[i]?.map((o) => {
              const access = accessOf(o.calendarId);
              return (
                <EventChip
                  key={`${o.eventId}${o.recurrenceId}`}
                  variant="chip"
                  title={occurrenceTitle(o.summary, access, labels)}
                  color={colors[o.calendarId]}
                  freeBusy={access === 'freebusy'}
                  onClick={() => grid.open(o)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className={classes.scroll} ref={grid.scrollRef}>
        <div className={classes.body}>
          <div className={classes.hours} aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>
                {formats.time.format(new Date(2000, 0, 1, h))}
              </span>
            ))}
          </div>
          <div className={classes.cols} ref={grid.colsRef}>
            {grid.days.map((day, i) => (
              <DayColumn
                key={day.toISOString()}
                grid={grid}
                day={day}
                index={i}
                items={grid.columns[i] ?? []}
                ghost={grid.ghost}
                draft={grid.draft}
                draftTitle={draftTitle}
                colors={colors}
                time={formats.time}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
