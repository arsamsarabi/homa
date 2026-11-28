// A provider's own iCalendar fields: X- properties that one server or client family uses for
// something Homa stores. Each provider adaptor (see packages/sync/src/providers) implements this,
// and parseIcs and serializeEvent call it for every series, so provider logic stays out of them.
import type ICAL from 'ical.js';

/** Event fields a provider can carry in its own properties. Undefined: this provider doesn't carry it. */
export type IcsExtras = {
  /** Travel time before the start, in minutes; null when the event has none. */
  travelMinutes?: number | null;
};

export type IcsExtension = {
  /** The fields this provider carries; Homa keeps the others local. */
  carries: readonly (keyof IcsExtras)[];
  /** Reads the provider's fields from a series' VEVENT. The VEVENT is untrusted: bound every value. */
  read(vevent: ICAL.Component, event: { allDay: boolean }): IcsExtras;
  /** Adds the provider's properties for `extras` to an outgoing series' VEVENT. */
  write(vevent: ICAL.Component, extras: IcsExtras): void;
};
