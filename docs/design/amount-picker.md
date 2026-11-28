# Amount picker: one control for reminders, travel time and repeat

Status: built, 2026-11-28.

Reminders, travel time and repeat all choose "a number of some unit". Today each looks different:

- **Reminders.** Chips, plus a number box, a unit select and an Add button that are always on show.
- **Travel time.** A fixed select with 5 min to 2 hr.
- **Repeat.** A fixed select (Every day, week, month, year), with no "every 2 weeks".

This design gives all three one `AmountPicker`: a field that opens a popover with presets and a row for your own value. Only the wording differs.

## The control

```
Travel time                          Repeat
┌───────────────────────────┐        ┌───────────────────────────┐
│ 🚗  30 min travel time   ▾ │        │ ↻  Every 2 weeks         ▾ │
└───────────────────────────┘        └───────────────────────────┘
  ┌─────────────────────────┐          ┌─────────────────────────┐
  │ None                    │          │ Does not repeat         │
  │ 5 min                   │          │ Every day               │
  │ 15 min                  │          │ Every week              │
  │ 30 min               ✓  │          │ Every 2 weeks        ✓  │
  │ 1 hr                    │          │ Every month             │
  │ 1 hr 30 min             │          │ Every year              │
  │ 2 hr                    │          │ ─────────────────────── │
  │ ─────────────────────── │          │ Every [ 3 ] [weeks ▾]   │
  │ [ 45 ] [minutes ▾]      │          │ Every 3 weeks     [Set] │
  │ 45 min travel time [Set]│          └─────────────────────────┘
  └─────────────────────────┘

Reminders (several values)
(10 minutes before ✓) (1 hour before ✓)  [+ Add reminder]
                                          ┌─────────────────────────┐
                                          │ At start                │
                                          │ 5 minutes before        │
                                          │ 10 minutes before    ✓  │  ← already added, disabled
                                          │ 1 day before            │
                                          │ ─────────────────────── │
                                          │ [ 2 ] [hours ▾] before  │
                                          │ 2 hours before    [Add] │
                                          └─────────────────────────┘
```

- **Trigger.** It looks like the other inputs (a Mantine `Input` with the field's label and hint), with the value as a sentence, a leading icon and a chevron. For reminders, the trigger is the "+ Add reminder" button after the chips. The chips work as they do now: check, then X on hover, and a tap removes one.
- **Presets.** A list with a check on the current value. Picking a preset applies it and closes the popover. A value that isn't a preset (say 45 min, or one set through the API) is added to the list, checked, so it isn't lost. In reminders, presets that are already added show checked and disabled.
- **Your own value.** A row that reads as the sentence: `Every [3] [weeks]`, `[2] [hours] before`, `[45] [minutes]`. Below it is a live preview of the result ("Every 3 weeks"), then **Set** (or **Add**). Enter in the number box does the same. Unit names follow the number ("1 week", "3 weeks").
- **Errors.** The error shows inline under the row and is linked with `aria-describedby`, for example "Up to 24 hours" or "Already added". The popover stays open.
- **None.** An optional first option ("None", "Does not repeat"). Reminders have no None: you remove a chip instead.

## Per use

| | Units | Presets | Limits | Stored as |
|---|---|---|---|---|
| Reminders | minutes, hours, days, weeks | At start, 5/10/15/30 min, 1 hr, 1 day | 0 to 4 weeks, 5 per event, no duplicates | minutes before (as now) |
| Travel time | minutes, hours | None, 5, 15, 30 min, 1 hr, 1 hr 30 min, 2 hr | 1 min to 24 hr | `travelMinutes` (as now) |
| Repeat | days, weeks, months, years; weekdays for weeks | Does not repeat, every day, week, 2 weeks, month, year | every 1 to 999 | RRULE `FREQ`, `INTERVAL`, `BYDAY` |

- Repeat gains `INTERVAL`, for example `FREQ=WEEKLY;INTERVAL=2`. Expansion and sync already read it.
  - A rule the picker can't express, with BYDAY, COUNT, UNTIL and the like, shows as a checked, read-only "Custom rule" option. It is kept untouched unless you pick something else, as now.
- Repeat is used in the event editor and in the Reminders drawer.
- Reminders are used in the event editor, tasks and the Settings default reminder, since they share `ReminderChips`.

## As built

- `components/amount-picker/AmountPicker` is the shared control. It takes a field, or a custom trigger through a render prop (reminders' **Add reminder**), presets as options, units, a prefix or suffix, a preview, and `onCustom`, which returns an error or applies the value. `extra` adds rows under the custom row (weekdays). The popover doesn't portal (it lives inside drawers) and keeps open when the field scrolls away (`hideDetached={false}`).
- `components/repeat-picker/RepeatPicker` works on RRULE strings; the forms keep the RRULE itself instead of a repeat enum. `services/repeat` parses, builds and names rules. A weekly rule on just the start's weekday leaves `BYDAY` out.
- `pages/calendar/event-editor/TravelPicker` covers minutes and hours, up to `MAX_TRAVEL_MINUTES`.
- `ReminderChips` keeps its chips; the old number + unit + Add row is gone.

## Component (proposal)

`components/amount-picker/` holds a controlled `AmountPicker` for one value. `ReminderChips` keeps the chips and uses the same popover body.

```ts
type Amount<U extends string> = { amount: number; unit: U };
type AmountPickerProps<U extends string> = {
  label: string;
  description?: string;
  icon?: ReactNode;
  value: Amount<U> | null;
  onChange: (v: Amount<U> | null) => void;
  units: readonly U[];
  presets: readonly (Amount<U> | null)[]; // null is the None option
  /** The sentence for a value: "Every 2 weeks", "30 min travel time". */
  format: (v: Amount<U> | null) => string;
  /** i18n key for the custom row, such as "every {{amount}} {{unit}}", so Farsi can order it its own way. */
  rowKey: string;
  /** An error message, or undefined when the value is fine. */
  validate?: (v: Amount<U>) => string | undefined;
  extraOption?: { label: string }; // "Custom rule"
};
```

- The custom row is built from the translation, with `{{amount}}` and `{{unit}}` replaced by the inputs. So the Farsi word order ("هر ۳ هفته") comes from `fa.json`, not from code.
- Labels use the existing formatters: `offsetLabel`, `travelDuration`, and a new `repeatLabel`, all with i18next plurals and `Intl` numbers.
- The pure parts (presets, `toAmount` and `fromAmount` for each use, validation, `repeatLabel`, and `INTERVAL` in `rruleOf` and `repeatOf`) live in `services/`, with unit tests.

## Accessibility and polish

- **Trigger.** A `button` with `aria-haspopup="dialog"` and `aria-expanded`, named by the field label.
- **Opening and closing.** Opening moves focus to the checked preset. Arrow keys move through the presets, and Tab reaches the custom row. Esc or a click outside closes the popover and returns focus to the trigger.
- **Focus rings.** Focus rings stay on.
- **Touch.** Rows are at least 36 px, and 44 px on touch screens. On phones the popover is full width under the field, not a separate sheet.
- **Number box.** It uses `inputMode="numeric"` with no steppers, so the field stays narrow, and it selects its text on focus.
- **Colours.** Mantine tokens only, so light and dark both work. The check uses the primary colour, and the preview text is dimmed.
- **RTL.** Logical properties only. The chevron and the check sit at the inline end. Icons are not mirrored, except the chevron's position.
- **Motion.** The Mantine popover fades in under 150 ms, and not at all with reduced motion.

## Not in scope

- Monthly by weekday ("the 2nd Tuesday").
- Ends after N times or on a date (COUNT and UNTIL).
- Hours and minutes in repeat (HOURLY, MINUTELY). Expansion stops after 10,000 occurrences counted from the series' start (`MAX_OCCURRENCES`), and the cache and standalone reminders expand from the start, so an every-minute rule would stop after about 7 days and an hourly one after about 14 months. Microsoft Graph can't express them either, so pushes would be refused. They need expansion that starts near the requested range first.
- Travel time after the event.

## Tests

- **Unit tests.** Conversions, limits, the repeat sentences in en and fa, and an `INTERVAL` round trip.
- **Component tests:**
  - Picking a preset sets it and closes the popover.
  - A custom value sets it and shows the preview.
  - An invalid value shows an inline error.
  - An off-list value shows as a checked option.
  - "Custom rule" stays when you don't pick anything else.
  - Esc returns focus to the trigger.
- **Updated tests.** The existing editor, reminders and settings tests move to the new control.
