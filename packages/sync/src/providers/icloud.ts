// iCloud (Apple Calendar): Apple's own VEVENT properties that Homa stores.
//
// Travel time: X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M on the series. Apple also writes
// X-APPLE-TRAVEL-START (the route's start) and X-APPLE-TRAVEL-ADVISORY-BEHAVIOR when it works the
// time out from a location; Homa keeps only the duration. iCloud stores no travel time on all-day
// events, nor does Homa.
import { type IcsExtension, type IcsExtras, MAX_TRAVEL_MINUTES } from '@homa/core';
import ICAL from 'ical.js';

const TRAVEL = 'x-apple-travel-duration';

/** Whole minutes from 1 to MAX_TRAVEL_MINUTES, else null (missing, negative, too long or unreadable). */
function travelMinutes(vevent: ICAL.Component): number | null {
  const value = vevent.getFirstPropertyValue(TRAVEL);
  let duration: ICAL.Duration;
  try {
    duration = value instanceof ICAL.Duration ? value : ICAL.Duration.fromString(String(value ?? '').slice(0, 40));
  } catch {
    return null;
  }
  const minutes = Math.round(duration.toSeconds() / 60);
  return minutes >= 1 && minutes <= MAX_TRAVEL_MINUTES ? minutes : null;
}

export const icloud: IcsExtension = {
  carries: ['travelMinutes'],
  // iCloud carries travel time, so a missing property means the event has none.
  read: (vevent: ICAL.Component, { allDay }: { allDay: boolean }): IcsExtras => ({
    travelMinutes: allDay ? null : travelMinutes(vevent),
  }),
  write(vevent: ICAL.Component, { travelMinutes }: IcsExtras): void {
    if (!travelMinutes) return;
    const p = new ICAL.Property(TRAVEL, vevent);
    p.setValue(ICAL.Duration.fromSeconds(travelMinutes * 60)); // ical.js writes VALUE=DURATION itself
    vevent.addProperty(p);
  },
};
