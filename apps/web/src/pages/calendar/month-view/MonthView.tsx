// Month view: whole weeks, up to three events per day. Drag an event to another day to move it.
import { Text, UnstyledButton } from '@mantine/core';
import type { CSSProperties, JSX, MouseEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EventChip } from '@/components';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { isoDate, sameDay } from '@/services/dates';
import classes from './MonthView.module.css';
import { SHOWN_PER_DAY, useMonthView } from './useMonthView';

export function MonthView(): JSX.Element {
  const { t } = useTranslation();
  const { formats, colors } = useCalendarPageModel();
  const m = useMonthView();
  const today = new Date();

  return (
    <section
      aria-label={t('calendar.views.month')}
      className={classes.grid}
      style={{ '--weeks': m.days.length / 7 } as CSSProperties}
    >
      {m.days.slice(0, 7).map((d) => (
        <Text key={`h${d.getDay()}`} size="xs" c="dimmed" ta="center" fw={500} className={classes.head}>
          {formats.weekdayShort.format(d)}
        </Text>
      ))}
      {m.days.map((d, i) => {
        const key = isoDate(d);
        const items = m.cells[i] ?? [];
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: clicking blank space is a mouse shortcut; the day button and "New event" are the accessible ways in.
          // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
          <div
            key={key}
            data-date={key}
            className={classes.cell}
            data-outside={d.getMonth() !== m.month || undefined}
            data-over={m.over === key || undefined}
            onClick={(e: MouseEvent<HTMLDivElement>): void => {
              if (e.target === e.currentTarget) m.createAt(d);
            }}
          >
            <UnstyledButton
              className={classes.day}
              aria-current={sameDay(d, today) ? 'date' : undefined}
              aria-label={formats.fullDate.format(d)}
              onClick={() => m.pickDay(d)}
            >
              {formats.dayNumber.format(d)}
            </UnstyledButton>
            {items.slice(0, SHOWN_PER_DAY).map((o) => (
              <EventChip
                key={`${o.eventId}${o.recurrenceId}`}
                variant={o.allDay ? 'chip' : 'line'}
                title={o.summary || t('calendar.untitled')}
                color={colors[o.calendarId]}
                time={o.allDay ? undefined : formats.time.format(new Date(o.start))}
                onPointerDown={(e: PointerEvent<HTMLButtonElement>): void => m.beginDrag(e, o, d)}
                onClick={(e: MouseEvent<HTMLButtonElement>): void => {
                  // Mouse clicks open through the drag handler; touch taps and the keyboard open here.
                  if ((e.nativeEvent as globalThis.PointerEvent).pointerType === 'touch' || e.detail === 0) m.open(o);
                }}
              />
            ))}
            {items.length > SHOWN_PER_DAY && (
              <UnstyledButton className={classes.more} onClick={() => m.pickDay(d)}>
                {t('calendar.more', { count: items.length - SHOWN_PER_DAY })}
              </UnstyledButton>
            )}
          </div>
        );
      })}
    </section>
  );
}
