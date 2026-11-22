import { useTranslation } from 'react-i18next';
import { useCalendarLocale, useDateFormats } from '@/hooks/locale';
import { useHomeZone, useSettings } from '@/hooks/settings';
import type { Task } from '@/schemas';
import { isoDate } from '@/services/dates';
import { relativeDay } from '@/services/tasks';
import { instantOf, wallOf } from '@/services/zones';

export type DueLabels = {
  /** "Tomorrow", "Mon 23 Nov, 15:00", with the Solar Hijri date when it is on; empty without a due. */
  due: (t: Pick<Task, 'dueDate' | 'dueTime' | 'tz'>) => string;
  /** A day heading: "Monday 23 November", with the Solar Hijri date when it is on. */
  day: (date: string) => string;
  /** A time block: "Today, 10:00 – 11:00". */
  block: (b: { start: string; end: string }) => string;
};

/**
 * Formats due dates in the viewer's zone and language. A timed due is shown in the viewer's zone
 * (it can fall on another date there); a date-only due is the same date everywhere.
 */
export function useDueLabel(today: string): DueLabels {
  const { t } = useTranslation();
  const tz = useHomeZone();
  const formats = useDateFormats(useCalendarLocale());
  const jalali = useSettings().data?.secondaryCalendar === 'jalali';
  const withJalali = (s: string, d: Date): string => (jalali ? `${s} (${formats.jalaliDayMonth.format(d)})` : s);

  return {
    due: (task: Pick<Task, 'dueDate' | 'dueTime' | 'tz'>): string => {
      if (!task.dueDate) return '';
      const wall = task.dueTime
        ? wallOf(instantOf(new Date(`${task.dueDate}T${task.dueTime}:00Z`), task.tz), tz)
        : new Date(`${task.dueDate}T00:00:00Z`);
      const rel = relativeDay(isoDate(wall), today);
      const date = withJalali(
        rel ? t(`tasks.rel.${rel}`) : `${formats.weekdayShort.format(wall)} ${formats.shortDayMonth.format(wall)}`,
        wall,
      );
      return task.dueTime ? `${date}, ${formats.time.format(wall)}` : date;
    },
    block: (b: { start: string; end: string }): string => {
      const s = wallOf(new Date(b.start), tz);
      const rel = relativeDay(isoDate(s), today);
      const date = rel ? t(`tasks.rel.${rel}`) : `${formats.weekdayShort.format(s)} ${formats.shortDayMonth.format(s)}`;
      return t('tasks.dayTime', { day: date, time: formats.time.formatRange(s, wallOf(new Date(b.end), tz)) });
    },
    day: (date: string): string => {
      const d = new Date(`${date}T00:00:00Z`);
      return withJalali(formats.weekdayLong.format(d), d);
    },
  };
}
