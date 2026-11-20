// The Jalali (Solar Hijri) calendar beside the Gregorian one, and the Persian occasions it marks.
// Dates come from Intl's "persian" calendar; days are wall dates (UTC midnights).
import { jalaliDate } from '@homa/core/time';
import { addDays } from '@/services/dates';

export { type JalaliDate, jalaliDate } from '@homa/core/time';

export const OCCASIONS = ['nowruz', 'sizdahBedar', 'chaharshanbeSuri', 'yalda'] as const;
export type Occasion = (typeof OCCASIONS)[number];

/**
 * The occasions on a date: Nowruz (1 Farvardin), Sizdah Bedar (13 Farvardin), Yalda (the night of
 * 30 Azar) and Chaharshanbe Suri (the Tuesday evening before the year's last Wednesday).
 */
export function occasionsOn(day: Date): Occasion[] {
  const { month, day: d } = jalaliDate(day);
  const out: Occasion[] = [];
  if (month === 1 && d === 1) out.push('nowruz');
  if (month === 1 && d === 13) out.push('sizdahBedar');
  if (month === 9 && d === 30) out.push('yalda');
  // Tuesday, the Wednesday after is in Esfand, and the Wednesday after that is in the new year.
  if (day.getUTCDay() === 2 && month === 12 && jalaliDate(addDays(day, 8)).month === 1) out.push('chaharshanbeSuri');
  return out;
}
