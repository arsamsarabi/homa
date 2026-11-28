// Travel time before an event: the choices the editor offers and how a length reads ("1 hr 30 min").

/** The longest travel time the API takes: 24 hours. */
export const MAX_TRAVEL_MINUTES = 1440;

/** The editor's choices in minutes, as in Apple Calendar. */
export const TRAVEL_PRESETS: readonly number[] = [5, 15, 30, 60, 90, 120];

/** The presets plus the event's own value when it isn't one of them, so it isn't lost. */
export const travelChoices = (current: number | null): number[] =>
  [...new Set([...TRAVEL_PRESETS, ...(current ? [current] : [])])].sort((a, b) => a - b);

/** A travel length in short units for `locale`: "30 min", "1 hr", "1 hr 30 min". */
export function travelDuration(minutes: number, locale: string): string {
  const unit = (u: 'hour' | 'minute', n: number): string =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && unit('hour', h), m && unit('minute', m)].filter(Boolean).join(' ');
}
