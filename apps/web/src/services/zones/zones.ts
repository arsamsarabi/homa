// Time zones for the views. The calendar shows "wall time" in a chosen zone: a Date whose UTC
// fields are the clock and calendar in that zone. Wall times have no clock changes, so day math on
// them is plain arithmetic; only these two conversions know about zones and daylight saving.

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall time in `tz` at `instant`. */
export function wallOf(instant: Date, tz: string): Date {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(instant)) p[type] = Number(value);
  const ms = ((instant.getTime() % 1000) + 1000) % 1000;
  return new Date(
    Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0, ms),
  );
}

const offsetAt = (t: number, tz: string): number => wallOf(new Date(t), tz).getTime() - t;
const DAY = 86_400_000;

/**
 * The instant a wall time in `tz` means. Like Temporal's "compatible": a time that happens twice
 * (clocks go back) is the earlier one; a time skipped (clocks go forward) moves on by the gap.
 */
export function instantOf(wall: Date, tz: string): Date {
  const w = wall.getTime();
  const before = offsetAt(w - DAY, tz);
  const after = offsetAt(w + DAY, tz);
  const fits = [before, after].map((o) => w - o).filter((t) => offsetAt(t, tz) === w - t);
  return new Date(fits.length ? Math.min(...fits) : w - before);
}

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
