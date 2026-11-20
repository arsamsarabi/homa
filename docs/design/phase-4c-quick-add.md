# Phase 4c: natural-language quick add

Type one line and get an event: "Dentist tue 3pm 45m", "Lunch with Sara tomorrow 1-2pm", "Team sync every Monday 10am", "Holiday 3-7 Dec", "call mum in 2 hours", "flight 23 Dec 06:40 for 3h", "جلسه فردا ساعت ۳ عصر", "تولد ۱۵ آذر".

## Where the parser runs

`parseQuickAdd(text, { now, tz, weekStart })` in `packages/core/src/quick-add/` (exported as `@homa/core/quick-add`). It is pure TypeScript with no dependencies and no network, so the web app runs it on every keystroke and a future mobile app can use the same code. It returns:

- `title`: the text left once dates and times are taken out.
- `start` and `end`: instants. All-day events get UTC midnights with an exclusive end, as the API stores them.
- `allDay` and `rrule` (an RRULE value or null).
- `defaulted`: true when nothing said when.
- `reminder`: true when the line began with "remind me" or "یادم بنداز". This is the hook for Phase 4a. Reminders aren't on main yet, so these lines make events for now. When 4a lands, quick add can create a reminder for them instead.

Wall times become instants with `wallOf` and `instantOf`, which moved from the web app to `@homa/core/time` so both share them. Jalali dates use `fromJalali`, the inverse of the `jalaliDate` the views already use for the secondary calendar. Both are built on Intl's `persian` calendar.

### Why not chrono-node

chrono-node (2.10.3, MIT, actively released) reads English dates well. It doesn't do what most of this feature needs:

- lengths ("45m", "for 3h")
- repeats ("every Monday")
- a week start for "next Monday"
- IANA zones with daylight saving (it takes a fixed offset)
- Farsi

It is also about 3 MB unpacked across its locales. We would wrap it and still write most of the grammar ourselves. About 600 lines we own (rules, word lists and resolution) is smaller and easier to test, so we add no dependency.

## How it reads a line

1. Normalize a copy of the text without moving any character:
   - Persian and Arabic-Indic digits become 0-9.
   - Arabic yeh and kaf become their Persian forms.
   - The zero-width non-joiner becomes a space.
   - Dashes become "-" and Latin letters are lowercased.
2. Run the rules in order: remind, repeats, relative times, date ranges, dates, day words, weekdays, time ranges, times, lengths. A rule takes the first match it can use and blanks it out so later rules skip it. A second date, or a day that doesn't exist (31 Feb, 31 Mehr), is not taken and stays in the title.
3. Join the characters no rule took into the title.
4. Resolve the facts against "now" in the home zone.

Word edges count letters and digits in any script, and a dot between letters ("Monday.com") doesn't make a word edge.

## Grammar

| | English | Farsi |
| --- | --- | --- |
| Days | today, tonight, tomorrow (tmrw, tmr), day after tomorrow, next week | امروز, امشب, فردا, پس‌فردا, هفته بعد/آینده |
| Weekdays | mon … sunday, full or short; "on", "this", "next" | شنبه … جمعه (with or without the non-joiner); "این"; "… بعد/آینده/دیگه" for next week's |
| Dates | 23 Dec, 23rd of December, Dec 23, December 23rd 2027, 2026-12-23 | ۱۵ آذر, ۱۵ آذر ۱۴۰۶ (Jalali months, including امرداد) |
| Date ranges (all-day) | 3-7 Dec, Dec 3-7, 3 to 7 December 2027 | ۳ تا ۷ دی, ۳-۷ دی |
| Times | 3pm, 3:30 pm, 15:00, at 7, noon, midnight, morning (09:00), afternoon (14:00), evening (18:00) | ۳ عصر, ساعت ۸ صبح, ساعت ۱۸:۳۰, ساعت ۳, ظهر, نیمه‌شب; alone: صبح 09:00, ظهر 12:00, بعدازظهر 14:00, عصر 17:00, شب 20:00 |
| Time ranges | 1-2pm, 11-1pm, 9am to 5:30pm, 10:00-11:30, 10pm-1am (ends the next day) | ۱ تا ۲ ظهر, ساعت ۳ تا ۵, ۹ تا ۱۱ شب, ۱۰:۰۰ تا ۱۱:۳۰ |
| Lengths | 45m, 45 min, 2h, 1.5h, 1h30, 2 hours, for 3h, for an hour, for half an hour | ۴۵ دقیقه, ۲ ساعت, نیم ساعت, به مدت ۹۰ دقیقه |
| Relative | in 2 hours, in 30 mins, in an hour, in half an hour, in 3 days, in a week | ۲ ساعت دیگه/دیگر/بعد, نیم ساعت دیگه, ۳ روز دیگه, ۲ هفته بعد |
| Repeats | daily, weekly, monthly, yearly, annually; every day/week/month/year; every other week; every 2 weeks; every Monday; every mon, wed and fri; every weekday | روزانه, هفتگی, ماهانه, سالانه; هر روز/هفته/ماه/سال; هر ۲ هفته; هر دوشنبه; هر شنبه و چهارشنبه |
| Reminder hook | remind me (to) … | یادم بنداز/بیار (که) … |

## Defaults and ambiguity

The preview always shows what will be created, so the rules pick one reading and show it rather than guess silently.

- **Zone.** Times are in the home zone from Settings, else the browser's. Timed events keep that zone, and relative words are anchored on now.
- **Nothing said when.** The event takes the next whole hour today and lasts an hour. The preview says "No date found: the next hour".
- **A time with no date.** It's today if that time is still ahead, else tomorrow.
- **A weekday on its own.** It's the coming one, and today counts while its time is still ahead. "next Monday" is the Monday in the next week, where weeks start on the Week start setting (or the language's default). On a Friday with weeks starting Monday, "next Sunday" is 9 days away; with weeks starting Sunday or Saturday, it's 2 days away.
- **A date with no year.** It's the next one on or after today: this year, else next year. Jalali dates work the same way in Jalali years.
- **An hour with no am or pm** ("at 3", "ساعت ۳"). 1 to 7 mean afternoon or evening (15:00), and 8 to 12 are as said.
- **Farsi parts of the day.** "ظهر" adds 12 to hours under 7. "شب" adds 12 from 5 to 11, so "۲ شب" is 02:00 and "۱۲ شب" is midnight.
- **"1-2pm".** The start takes the end's am or pm unless that would put it after the end, so "11-1pm" is 11:00 to 13:00.
- **A date with no time.**
  - With no length, it's an all-day event.
  - With a length ("Dentist tomorrow 45m"), it starts at 09:00.
- **Lengths** are elapsed time: 23:00 GMT "for 3h" ends at 03:00 BST on the night the clocks change. An end time is a wall time.
- **Daylight saving.** A wall time that's skipped moves forward by the gap, and one that repeats takes the earlier one, as in the event form.
- **Repeats.** One weekday that matches the start gives `FREQ=WEEKLY`, so the editor shows "Every week". Several days give `BYDAY`. "every Monday" with no date starts on the coming Monday.

## UI

- **Field.** A "Quick add" field sits under the calendar toolbar, with a "More options" button. "Q" focuses it and is listed in the shortcuts sheet. ⌘K / Ctrl K stays the command palette.
- **Preview.** As you type, the field's description shows:
  - the calendar's color dot and the title
  - the date with times, plus a Jalali date when that calendar is on
  - the length, the repeat ("Every week on Mon, Wed, Fri") and the calendar
  - the no-date note and the key hint
  
  Being the description, it's read with the field (`aria-describedby`). The app's live region also announces it once typing pauses.
- **Enter** creates the event, clears the field and goes to the day it landed on. It goes in the calendar you last created an event in (kept in this browser), else the first writable one. Errors show under the field and the text stays.
- **Shift+Enter, Alt+Enter or "More options"** open the event editor with the times, title, repeat and calendar filled in. Enter does this too when there's no writable calendar.
- **Escape** clears the field. Enter is ignored while an input method is composing, as Farsi keyboards do.
- **Other.** The field follows both themes and RTL: Mantine colors, logical properties, and badges that wrap on phones.

## Known limits

- Numeric dates like 3/12 aren't read, because day/month order differs by locale. Use "3 Dec" or 2026-12-03.
- A date range can't span months ("28 Dec - 2 Jan").
- Farsi number words other than یک and نیم aren't read, and neither are Gregorian month names in Farsi.
- Only the first date, time, length and repeat are used.
- "Remind me" makes an event until Phase 4a reminders exist.
- The default slot doesn't check free/busy.
