// Year view: twelve small months; days with events are marked. Pick a day to open it.
import { Text, UnstyledButton } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { isoDate, sameDay } from '@/services/dates';
import { useYearView } from './useYearView';
import classes from './YearView.module.css';

export function YearView(): JSX.Element {
  const { t } = useTranslation();
  const { formats } = useCalendarPageModel();
  const { months, busy, pickDay } = useYearView();
  const today = new Date();
  return (
    <section aria-label={t('calendar.views.year')} className={classes.grid}>
      {months.map(({ ref, days }) => (
        <section key={ref.getMonth()} aria-label={formats.monthName.format(ref)}>
          <Text fw={700} mb={4}>
            {formats.monthName.format(ref)}
          </Text>
          <div className={classes.month}>
            {days.slice(0, 7).map((d) => (
              <Text key={`h${d.getDay()}`} size="10px" c="dimmed" ta="center" aria-hidden="true">
                {formats.weekdayNarrow.format(d)}
              </Text>
            ))}
            {days.map((d) =>
              d.getMonth() === ref.getMonth() ? (
                <UnstyledButton
                  key={d.toISOString()}
                  className={classes.day}
                  data-busy={busy.has(isoDate(d)) || undefined}
                  aria-current={sameDay(d, today) ? 'date' : undefined}
                  aria-label={formats.fullDate.format(d)}
                  onClick={() => pickDay(d)}
                >
                  {formats.dayNumber.format(d)}
                </UnstyledButton>
              ) : (
                <span key={d.toISOString()} />
              ),
            )}
          </div>
        </section>
      ))}
    </section>
  );
}
