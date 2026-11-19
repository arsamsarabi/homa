// The toolbar title for a view: "Thursday, 19 November 2026", "November 2026", "2026", "19 Nov – 18 Dec".
import type { View } from '@/schemas';
import { addDays, type DayRange } from '@/services/dates';

export type TitleFormats = {
  fullDate: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
  year: Intl.DateTimeFormat;
  shortDayMonth: Intl.DateTimeFormat;
};

export function viewTitle(view: View, date: Date, range: DayRange, f: TitleFormats): string {
  switch (view) {
    case 'day':
      return f.fullDate.format(date);
    case 'week':
      return f.monthYear.format(range.from);
    case 'month':
      return f.monthYear.format(date);
    case 'year':
      return f.year.format(date);
    case 'agenda':
      return f.shortDayMonth.formatRange(range.from, addDays(range.to, -1));
  }
}
