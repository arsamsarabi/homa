// The toolbar title for a view: "Thursday, 19 November 2026", "November 2026", "2026", "19 Nov – 18 Dec",
// and the Jalali months it covers: "Aban – Azar 1405".
import type { View } from '@/schemas';
import { addDays, type DayRange } from '@/services/dates';

export type TitleFormats = {
  fullDate: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
  year: Intl.DateTimeFormat;
  shortDayMonth: Intl.DateTimeFormat;
  jalaliFullDate: Intl.DateTimeFormat;
  jalaliMonthYear: Intl.DateTimeFormat;
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

/** The Jalali dates a view covers: the date for a day, else the months from first to last day. */
export function jalaliViewTitle(view: View, date: Date, range: DayRange, f: TitleFormats): string {
  if (view === 'day') return f.jalaliFullDate.format(date);
  // A month view lays out whole weeks; its title covers only the month itself.
  const from = view === 'month' ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)) : range.from;
  const to = view === 'month' ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) : range.to;
  return f.jalaliMonthYear.formatRange(from, addDays(to, -1));
}
