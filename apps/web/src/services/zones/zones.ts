// Time zones for the views. The calendar shows "wall time" in a chosen zone: a Date whose UTC
// fields are the clock and calendar in that zone. The two conversions (wallOf, instantOf) live in
// @homa/core so the quick-add parser shares them.
export { instantOf, wallOf } from '@homa/core/time';

/** True for zones this browser knows, like Europe/London. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false; // Intl throws a RangeError for unknown zones
  }
}

/** The browser's IANA time zone. */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every zone the browser knows, for pickers. */
export const timeZones = (): string[] => {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
};
