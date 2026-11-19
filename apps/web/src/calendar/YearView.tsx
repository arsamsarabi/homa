// Year view: twelve small months; days with events are marked. Pick a day to open it.
import { Text, UnstyledButton } from '@mantine/core';
import type { Occurrence } from './api';
import { addDays, isoDate, localSpan, monthGrid, sameDay, startOfDay } from './dates';

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

type Props = {
  year: number;
  occurrences: Occurrence[];
  locale: string;
  weekStart: number;
  onPickDay: (d: Date) => void;
};

export function YearView({ year, occurrences, locale, weekStart, onPickDay }: Props) {
  const busy = new Set<string>();
  for (const o of occurrences) {
    const { start, end } = localSpan(o);
    // Mark each day the occurrence touches (at most a few weeks, so the loop stays short).
    for (let d = startOfDay(start); d < end || sameDay(d, start); d = addDays(d, 1)) {
      busy.add(isoDate(d));
      if (busy.size > 400) break;
    }
  }
  const month = new Intl.DateTimeFormat(locale, { month: 'long' });
  const dayNum = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const today = new Date();
  return (
    <div className="yv">
      {MONTHS.map((m) => {
        const ref = new Date(year, m, 1);
        const days = monthGrid(ref, weekStart);
        return (
          <section key={m} className="yv-month" aria-label={month.format(ref)}>
            <Text fw={700} mb={4}>
              {month.format(ref)}
            </Text>
            <div className="yv-grid">
              {days.slice(0, 7).map((d) => (
                <Text key={`h${d.getDay()}`} size="10px" c="dimmed" ta="center">
                  {weekday.format(d)}
                </Text>
              ))}
              {days.map((d) =>
                d.getMonth() === m ? (
                  <UnstyledButton
                    key={d.toISOString()}
                    className="yv-day"
                    data-busy={busy.has(isoDate(d)) || undefined}
                    aria-current={sameDay(d, today) ? 'date' : undefined}
                    onClick={() => onPickDay(d)}
                  >
                    {dayNum.format(d)}
                  </UnstyledButton>
                ) : (
                  <span key={d.toISOString()} />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
