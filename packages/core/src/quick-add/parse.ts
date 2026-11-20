// Natural-language quick add: "Dentist tue 3pm 45m" → a title, a start and end (or all-day dates)
// and an optional RRULE. Pure and offline, so the web app and a future mobile app share it.
// The grammar and its defaults are in docs/design/phase-4c-quick-add.md.
import { instantOf, wallOf } from '../time';
import { normalize, RRULE_DAYS } from './lexicon';
import { type Facts, RULES } from './rules';

const MINUTE = 60_000;
const DAY = 86_400_000;
const DEFAULT_MINUTES = 60;
/** The start of a dated event given a length but no time ("Dentist tomorrow 45m"). */
const MORNING = 9 * 60;

export type QuickAddContext = {
  /** The instant relative words are anchored on. */
  now: Date;
  /** The IANA zone times are said in: the home zone, else the browser's. */
  tz: string;
  /** First day of the week, 0 = Sunday; "next Monday" is the Monday of the next week. */
  weekStart: number;
};

export type QuickAdd = {
  /** What's left once the dates and times are taken out; may be empty. */
  title: string;
  /** Instants. All-day events have UTC midnights and an exclusive end, as the API stores them. */
  start: Date;
  end: Date;
  allDay: boolean;
  /** An RRULE value without "RRULE:", or null. */
  rrule: string | null;
  /** True when no date or time was found, so the event takes the next whole hour. */
  defaulted: boolean;
  /**
   * The text began with "remind me" / "یادم بنداز". Phase 4a hook: once reminders exist, quick add
   * can make a reminder for these; until then they are events like any other.
   */
  reminder: boolean;
};

const startOfDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);
const at = (day: Date, minutes: number): Date => new Date(day.getTime() + minutes * MINUTE);

/** Reads a quick-add line. Never throws: text it can't read stays in the title. */
export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAdd {
  const nowWall = wallOf(ctx.now, ctx.tz);
  const today = startOfDay(nowWall);
  const facts: Facts = {};
  let work = normalize(text);
  const used = new Array<boolean>(text.length).fill(false);
  for (const { re, apply } of RULES) {
    for (const m of work.matchAll(re)) {
      if (!apply(m, facts, { today, weekStart: ctx.weekStart })) continue;
      const from = m.index ?? 0;
      const to = from + m[0].length;
      used.fill(true, from, to);
      // Blank the match out so later rules don't read it again.
      work = work.slice(0, from) + ' '.repeat(to - from) + work.slice(to);
      break;
    }
  }
  // Matches never split a surrogate pair, so blanking by UTF-16 unit is safe.
  const left = text
    .split('')
    .map((ch, i) => (used[i] ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ');
  return { title: trimEdges(left), ...resolve(facts, ctx, nowWall, today), reminder: facts.reminder === true };
}

const EDGE = /[\s,;:@-]/;

/** Drops spaces and stray punctuation at both ends (a scan, not a regex, so long input stays linear). */
function trimEdges(s: string): string {
  let from = 0;
  let to = s.length;
  while (from < to && EDGE.test(s.charAt(from))) from++;
  while (to > from && EDGE.test(s.charAt(to - 1))) to--;
  return s.slice(from, to);
}

type Times = Pick<QuickAdd, 'start' | 'end' | 'allDay' | 'rrule' | 'defaulted'>;

function resolve(f: Facts, ctx: QuickAddContext, nowWall: Date, today: Date): Times {
  const length = (f.durationMin ?? DEFAULT_MINUTES) * MINUTE;
  if (f.relativeMs !== undefined) {
    const start = new Date(ctx.now.getTime() + f.relativeMs);
    return {
      start,
      end: new Date(start.getTime() + length),
      allDay: false,
      rrule: rruleOf(f, start, ctx.tz),
      defaulted: false,
    };
  }

  const time = f.time ?? f.defaultTime;
  // The first of `days` from today, skipping today when its time has already gone.
  const soonest = (days: readonly number[]): Date => {
    for (let n = 0; n <= 7; n++) {
      const d = addDays(today, n);
      if (days.includes(d.getUTCDay()) && (time === undefined || at(d, time) > nowWall)) return d;
    }
    return today;
  };

  let date = f.date;
  if (!date && f.weekday) {
    const { day, next } = f.weekday;
    const nextWeek = addDays(today, 7 - ((today.getUTCDay() - ctx.weekStart + 7) % 7));
    date = next ? addDays(nextWeek, (day - ctx.weekStart + 7) % 7) : soonest([day]);
  }
  if (!date && f.repeat?.byDay.length) date = soonest(f.repeat.byDay);

  if (!date && time === undefined && !f.repeat && f.durationMin === undefined) {
    // Nothing said when: the next whole hour from now.
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), nowWall.getUTCHours() + 1),
    );
    const s = instantOf(start, ctx.tz);
    return { start: s, end: new Date(s.getTime() + length), allDay: false, rrule: null, defaulted: true };
  }

  if (time === undefined && f.durationMin === undefined) {
    const first = date ?? today;
    return {
      start: first,
      end: addDays(f.endDate ?? first, 1),
      allDay: true,
      rrule: rruleOf(f, first, 'UTC'),
      defaulted: false,
    };
  }

  const minutes = time ?? MORNING;
  let day = date ?? today;
  // A time with no date is the next time the clock says it: today, or tomorrow once it's gone.
  if (!date && !f.repeat?.byDay.length && at(day, minutes) <= nowWall) day = addDays(day, 1);
  const startWall = at(day, minutes);
  const start = instantOf(startWall, ctx.tz);
  let end: Date;
  if (f.endTime !== undefined) {
    let endWall = at(f.endDate ?? day, f.endTime);
    if (endWall <= startWall) endWall = addDays(endWall, 1); // "10pm-1am" ends the next day
    end = instantOf(endWall, ctx.tz);
  } else {
    end = f.endDate ? instantOf(at(f.endDate, minutes + length / MINUTE), ctx.tz) : new Date(start.getTime() + length);
  }
  return { start, end, allDay: false, rrule: rruleOf(f, start, ctx.tz), defaulted: false };
}

/** The RRULE for what was said. A single weekday that is the start's own day needs no BYDAY. */
function rruleOf(f: Facts, start: Date, tz: string): string | null {
  if (!f.repeat) return null;
  const { freq, interval, byDay } = f.repeat;
  const startDay = wallOf(start, tz).getUTCDay();
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (byDay.length > 1 || (byDay.length === 1 && byDay[0] !== startDay)) {
    parts.push(`BYDAY=${[...new Set(byDay)].map((d) => RRULE_DAYS[d]).join(',')}`);
  }
  return parts.join(';');
}
