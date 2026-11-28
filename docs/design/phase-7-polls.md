# Phase 7: group date-finding (polls)

Status: designed, 2026-11-28. 7a is next; the rest get their own design when they start.

An organizer asks a group "when can we all do this?". Homa already knows much of the answer from the 6c availability engine, so a poll starts from people's free/busy and asks them to rank what's left. See [product-definition.md](../product/product-definition.md), section 7.

## Scope

| Part | What | Depends on |
| --- | --- | --- |
| **7a** | Polls with candidate slots for Homa users: ranked answers, required and optional people, quorum, deadline, finalizing into events. Includes auto-suggest (7d) and tentative holds (7e). | 6c |
| 7b | Link guests: a scoped token per guest, voting with just a name, an `.ics` invite email on finalize | 7a |
| 7c | More modes: date ranges (trips: minimum and maximum nights, start weekdays, must include a weekend) and an open window people paint | 7a |
| 7d | Auto-suggest: rank slots from free/busy before anyone answers. **Built in 7a.** | 6c |
| 7e | Tentative holds while a poll is open. **Built in 7a.** | 7a |
| 7f | Poll views: a full calendar view and a Gantt-style view, one row per person | 7a, 7c |
| 7g | Follow a person's availability, as an overlay or an ICS feed | 6c |

The data model below is shaped for all of them, so 7b, 7c and 7f add tables and columns without reworking 7a's.

Not in phase 7a: guests (7b), ranges and windows (7c), the calendar and Gantt poll views (7f), following availability (7g), updating members' copies after the organizer edits the final event, comments on polls, and recurring polls.

## Decisions

Arsam chose 1 to 5 on 2026-11-28. The rest are calls made without him; any can be overturned.

1. **Ranked answers.** Each person puts the slots they can make in order, best first. The rest go under **Can't make it**. There is no "if need be".
2. **Free/busy pre-fills the ballot.** A slot that clashes with someone's busy time starts under Can't make it; the rest start unranked. Nothing is saved until the person presses **Save**. The organizer sees "busy" marks for people who haven't answered.
3. **Finalizing makes one event plus copies.** The event goes in the organizer's chosen calendar. Each Homa participant who ranked the winning slot gets a copy in their own first Homa calendar, linked to the poll, which they can move or delete.
4. **Holds are organizer-only and optional.** A switch on the poll, off by default.
5. **Holds are derived, not stored as events.** They come from the open polls' slots, so they can never sync to Google, iCloud or Outlook, and there's nothing to clean up.
6. **Borda points.** In a list of n ranked slots, the first gets n points, the next n − 1, and so on; Can't and unranked get 0. Simple to explain ("higher in more lists wins") and robust to people ranking different numbers of slots.
7. **The organizer decides.** Homa recommends the top eligible slot but never finalizes by itself, even at the deadline. The deadline closes answering and notifies the organizer.
8. **Visibility.** A poll is visible to its organizer and participants only; everyone else gets a 404. Participants see everyone's answers by name. Anonymous polls can come later.
9. **Copies land in the participant's first Homa calendar** (the oldest native one, normally "Personal"). There is no per-user default calendar yet; when one exists, copies use it.
10. **Drag needs a library, and isn't the only way to rank.** `@hello-pangea/dnd` (keyboard dragging built in, works with touch) for drag, plus move-up, move-down and "Can't" buttons on every row, as WCAG 2.2 asks for dragging movements.

## Data model

```
polls
  id, organizer_user_id → users (cascade)
  title, description, location
  duration_minutes          -- 5 to 1440; slots must match it
  tz                        -- the organizer's zone when the poll was made, for copy and emails
  mode                      -- 'slots' (7c adds 'ranges', 'window')
  status                    -- 'draft' | 'open' | 'closed' | 'finalized' | 'cancelled'
  deadline                  -- timestamptz, null for no deadline
  quorum                    -- int, null means everyone
  holds                     -- bool, default false
  calendar_id → calendars   -- where the organizer's event goes (set null; finalize asks again)
  final_slot_id → poll_slots, final_event_id → events (set null)
  opened_at, closed_at, finalized_at, created_at, updated_at

poll_slots
  id, poll_id (cascade), start_at, end_at
  unique (poll_id, start_at)

poll_participants
  id, poll_id (cascade)
  user_id → users (cascade)  -- 7b adds guest_name and token_hash, with a check that one is set
  required                   -- bool, default false
  responded_at               -- null until they first save
  unique (poll_id, user_id)

poll_answers
  participant_id (cascade), slot_id (cascade)
  rank                       -- 1 is best; null means "can't make it"
  primary key (participant_id, slot_id)
  -- a missing row means unranked: neither ranked nor "can't"
```

- The organizer is always a participant (required), so their own ranking counts.
- `events.poll_id` (set null) marks the organizer's event and the members' copies.
- `notifications.poll_id` (cascade) carries poll notifications; their `title` and `occurrence_start` hold what the panel shows.
- Ranks within one participant are 1..k with no gaps; the server renumbers what it receives.

## Lifecycle

```
draft ──open──▶ open ──close / deadline──▶ closed ──finalize──▶ finalized
  │               │  ◀──reopen (new deadline)──┘                  ▲
  │               └──────────────finalize──────────────────────────┘
  └──delete      open/closed ──cancel──▶ cancelled
```

- **Draft.** Only the organizer sees it. Everything is editable.
- **Open.** Participants are notified and can answer. The organizer can still add slots and people; removing a slot removes its answers and tells nobody. Changing the duration isn't allowed once open.
- **Closed.** Answering stops (at the deadline, or when the organizer closes early). The organizer can reopen with a new deadline.
- **Finalized.** One slot was chosen; events were made. Read-only.
- **Cancelled.** Read-only; participants are told. Holds disappear.
- The deadline is checked by the existing every-minute job loop (`polls.close-due`).

## API

| Route | Who | What |
| --- | --- | --- |
| `GET /api/polls?view=mine\|answer\|past` | signed in | Lists: polls I organize (draft, open, closed); polls I'm in that are open; finalized and cancelled ones |
| `POST /api/polls` | signed in | Create a draft |
| `GET /api/polls/{id}` | organizer, participants | The poll, slots, participants, every answer, and `results` |
| `PATCH /api/polls/{id}` | organizer | Edit (rules above) |
| `DELETE /api/polls/{id}` | organizer | Delete a draft, or cancel an open or closed poll |
| `POST /api/polls/{id}/open` | organizer | Needs at least 2 slots and 1 other participant |
| `POST /api/polls/{id}/close`, `/reopen` | organizer | `reopen` takes a new deadline |
| `POST /api/polls/{id}/finalize` | organizer | `{ slotId, calendarId }` |
| `PUT /api/polls/{id}/answers` | participants | `{ ranked: slotId[], cannot: slotId[] }` for the caller; while open |
| `POST /api/polls/suggest` | signed in | `{ from, to, durationMinutes, userIds, requiredIds, days?, between? }` → up to 10 slots |
| `GET /api/polls/{id}/prefill` | participants | The caller's slots that clash with their busy time |

- `results` per slot: `points`, `canMake` (count), `cannot` (names), `unranked` (names), `eligible`, and `reason` when not eligible ("Sam can't", "3 of 4 needed").
- `GET /api/polls/{id}` also returns `busy` marks per participant and slot, from the availability engine as the organizer sees it; only the organizer gets them.
- Finalize: in one transaction, create the organizer's event (through the normal event service, so it syncs out), then a copy per participant who ranked the slot, then notifications. A calendar the organizer can't write is a 403.

## Scoring

Pure functions in `@homa/core/polls`, with unit tests:

- `points(answers)`: Borda points per slot.
- `eligible(slot, participants, quorum)`: no required participant has it under Can't, and `canMake ≥ (quorum ?? participants.length)`, where `canMake` counts people who ranked the slot. Unranked is unknown and doesn't count, so a quorum is only met by people who said they can come.
- `rankSlots(...)`: eligible slots first, by points, then by `canMake`, then the earlier start; ineligible ones after, in the same order.
- `suggest(busyByPerson, opts)`: walks the range in 15-minute steps inside the day and time bounds, scores each candidate by required people free (all must be, or it's dropped) then optional people free, and returns the top 10 that don't overlap each other.

## Holds

- When `holds` is on and the poll is open, each slot is a hold for the organizer.
- `GET /api/occurrences` gains `holds: { pollId, title, start, end }[]` for the caller's own open polls in range. A separate list, not occurrences, so nothing that reads occurrences (sync, reminders, export) sees them.
- `/api/availability` adds the organizer's holds to their busy times, only when the organizer is the person being asked about.
- Holds stop when the poll is closed, finalized or cancelled.

## Notifications

| When | Who | Panel text |
| --- | --- | --- |
| Poll opens | participants except the organizer | "{organizer} asks: when can you do {title}?" |
| 24 hours before the deadline | participants who haven't answered | "{title}: answers close tomorrow" |
| Deadline passes | organizer | "{title}: answers are in. Pick a time" |
| Finalized | participants | "{title} is set: {when}" |
| Cancelled | participants | "{title} was cancelled" |

They use the existing notifications table and the person's channels (push, email, ntfy and so on), with dedupe keys `poll:{id}:{kind}`. Clicking one opens the poll.

## Web

### Polls page

`/polls`, linked from the sidebar under Reminders (`IconCalendarQuestion`), with breadcrumbs **Calendar › Polls**.

```
┌ Polls ──────────────────────────────────────────── [+ New poll] ┐
│ [ To answer (2) ] [ Mine ] [ Past ]                              │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Book club, December                    Answer by Fri 5 Dec   │ │
│ │ Ada asks · 4 times · 3 of 6 answered        [ Answer → ]     │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Family dinner                         ● You answered         │ │
│ │ Sam asks · 3 times · 5 of 5 answered        [ Change ]       │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- Tabs are `PageTabs` with the tab in the URL (`?tab=answer`), as in Settings. **To answer** is the default when it isn't empty, otherwise **Mine**.
- Each poll is a card: title, who asks (or the status for your own: Draft, Open, Answers in, Set for …), the deadline as relative time, the counts, and one primary action.
- Empty states say what to do: "Nothing to answer" / "Ask a group when they can meet. **New poll**".
- On phones the cards stack full width; the action becomes the whole card's target.

### Poll editor

A right drawer (`size="lg"`, full screen on phones), like the event editor, with the dirty-form guard.

```
┌ New poll ─────────────────────────────────────────── ✕ ┐
│ Title      [ Book club, December                    ]  │
│ Length     [ 🕑 1 hr 30 min                       ▾ ]  │  ← AmountPicker, minutes/hours
│ Location   [                                        ]  │
│                                                        │
│ People                                                 │
│ [ Search people or circles…                       ]   │
│  ○ Ada (you)                          Required ●━━     │
│  ○ Sam                                Required ━━○  ✕  │
│  ○ Book club (4 people)  ▸                         ✕   │
│ Need at least  [ 4 ] of 6        (empty: everyone)     │
│                                                        │
│ Times                          [ ✨ Suggest times ]    │
│  ◀  1 – 7 Dec  ▶                                       │
│  ┌──┬──┬──┬──┬──┬──┬──┐                               │
│  │Mo│Tu│We│Th│Fr│Sa│Su│   mini week grid: click or     │
│  │  │▒▒│  │  │██│  │  │   drag to add a slot of the    │
│  │  │  │  │  │  │██│  │   poll's length; ▒ = someone   │
│  └──┴──┴──┴──┴──┴──┴──┘   busy                        │
│  Fri 5 Dec, 19:00 – 20:30                          ✕   │
│  Sat 6 Dec, 18:00 – 19:30                          ✕   │
│                                                        │
│ Answer by  [ Thu 4 Dec, 18:00 ]                        │
│ ☐ Hold these times in my calendar                      │
│ Add the event to [ Personal ▾ ]                        │
│                                                        │
│                     [ Save draft ]  [ Send to people ] │
└────────────────────────────────────────────────────────┘
```

- **Length** reuses `AmountPicker` (presets 30 min, 1 hr, 1 hr 30 min, 2 hr, 3 hr; minutes and hours; up to 24 hr).
- **People** is a `MultiSelect`-style search over the directory and your circles. A circle expands into its people (you can then remove one). The organizer is first and always required.
- **Need at least** is a `NumberInput` (2 to the number of people); empty means everyone.
- **Times.** A compact version of the week time grid, 07:00 to 23:00, with the participants' merged busy shaded (diagonal hatch, so it isn't colour alone). Clicking a free spot adds a slot of the poll's length there; dragging chooses its start; an added slot shows as a solid block with its number. Below it, the slot list (sorted, with ✕) is the accessible way to review and remove slots, and **Add a time** opens a date-and-time field for keyboard users.
- **Suggest times** opens a popover: range (this week, next week, next 2 weeks, a custom range), days (weekdays, weekends, any), between (any time, daytime, evenings, a custom range). It shows up to 10 suggestions, each with "everyone free" or "Sam busy", and an **Add** per row plus **Add all**.
- The primary action is **Send to people** (opens the poll), the secondary **Save draft**. Errors show inline per field.

### Ballot

`/polls/{id}` for a participant while the poll is open.

```
┌ Book club, December ──────────────────────────────────┐
│ Ada asks · 1 hr 30 min · Answer by Thu 4 Dec, 18:00   │
│ Put the times you can make in order, best first.      │
│                                                       │
│ Your order                                            │
│ ┌───────────────────────────────────────────────────┐ │
│ │ ⠿  1  Fri 5 Dec, 19:00 – 20:30      ▲ ▼  Can't   │ │
│ │ ⠿  2  Tue 9 Dec, 19:00 – 20:30      ▲ ▼  Can't   │ │
│ └───────────────────────────────────────────────────┘ │
│ Not ranked yet                                        │
│ ┌───────────────────────────────────────────────────┐ │
│ │    Wed 10 Dec, 19:00 – 20:30     [ + Rank ] Can't │ │
│ └───────────────────────────────────────────────────┘ │
│ Can't make it                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │    Sat 6 Dec, 18:00 – 19:30  Busy in your calendar│ │
│ │                                  [ I can make it ] │ │
│ └───────────────────────────────────────────────────┘ │
│                                                       │
│                                   [ Save my answer ]  │
└───────────────────────────────────────────────────────┘
```

- Three groups: **Your order**, **Not ranked yet**, **Can't make it**. Drag moves rows within and between groups (`@hello-pangea/dnd`, with its keyboard dragging: Space to lift, arrows to move, Space to drop).
- Every row also has buttons, so dragging is never needed: ▲ ▼ (move up or down in the order), **Can't**, **+ Rank** (adds to the end of the order) and **I can make it** (back to Not ranked).
- Rank numbers sit in a filled circle with the primary colour. Moving announces the new position through the existing announcer ("Fri 5 Dec moved to 1 of 3").
- Pre-filled rows say why: "Busy in your calendar". The person can move them anyway.
- Times show in the viewer's home zone, with the poll's zone in a hint if it differs ("19:00 in London").
- A sticky **Save my answer** bar on phones. Leaving with unsaved changes asks first (the dirty guard).
- Rows are 48 px tall with 8 px between targets, and full width on phones.

### Results

The organizer's view of `/polls/{id}` (and what participants see under their ballot, without the actions).

```
┌ Book club, December ───── Open · 4 of 6 answered ─── [ Close answers ] ┐
│ Recommended: Fri 5 Dec, 19:00 – 20:30            [ Pick this time ]    │
│                                                                        │
│ Time                  Points  Can make  Can't        Not yet           │
│ ★ Fri 5 Dec 19:00       14     5 of 6    –           Lee               │
│   Tue 9 Dec 19:00       11     4 of 6    Mo          Lee               │
│   Sat 6 Dec 18:00        6     3 of 6    Sam (req.)  –    Not possible │
│                                                    Sam is required     │
│ ▸ Answers by person                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

- A Mantine `Table` sorted by `rankSlots`; the recommended row is marked with a star and a label, not colour alone. Ineligible rows are dimmed with their reason as text.
- **Answers by person** expands to a grid: rows are people, columns are slots, cells show their rank number, "Can't" or "–", plus a busy mark for people who haven't answered.
- **Pick this time** (or a ⋯ menu on any row) opens a confirm modal: the time, the calendar for the event (prefilled), "{n} people get it in their calendar", **Set the time**. Picking an ineligible slot says why it's not recommended and still allows it.
- On phones the table becomes one card per slot (time, points, counts, reason), and the per-person grid scrolls sideways inside its own box.

### Holds in the views

- Week, work week and day draw holds as a dashed outline in the primary colour with a light hatch, titled "Tentative: {title}", above normal events in the stacking order but not taking part in the overlap layout (they sit behind, at 60% width aligned to the inline end).
- Clicking one opens its poll. They aren't draggable or resizable.
- Agenda lists them with a "Tentative" badge; month shows them as dashed chips. Year doesn't show them.
- Screen readers get "Tentative hold for {title}, {time}".

### Accessibility, RTL and theming

- Mantine tokens only, for light and dark. Hatches use `--mantine-color-default-border`, so they work on both.
- Logical properties throughout; the ▲ ▼ buttons keep their meaning in RTL (they're about order, not direction). Drag works in RTL because the list is vertical.
- Focus rings stay. Every icon button has a label (`aria-label="Move Fri 5 Dec up"`).
- Motion: drag lift and drop animate under 200 ms, and not at all with reduced motion.

## Copy (excerpt)

| Key | en | fa |
| --- | --- | --- |
| `polls.title` | Polls | نظرسنجی‌ها |
| `polls.new` | New poll | نظرسنجی تازه |
| `polls.tabs.answer` | To answer | برای پاسخ |
| `polls.tabs.mine` | Mine | مال من |
| `polls.tabs.past` | Past | گذشته |
| `polls.yourOrder` | Your order | ترتیب شما |
| `polls.unranked` | Not ranked yet | هنوز رتبه‌بندی نشده |
| `polls.cannot` | Can't make it | نمی‌توانم |
| `polls.busyHint` | Busy in your calendar | در تقویم شما مشغول |
| `polls.save` | Save my answer | ذخیرهٔ پاسخ من |
| `polls.recommended` | Recommended | پیشنهادی |
| `polls.pick` | Pick this time | انتخاب این زمان |
| `polls.hold` | Tentative: {{title}} | موقت: {{title}} |
| `polls.suggest` | Suggest times | پیشنهاد زمان |
| `polls.send` | Send to people | فرستادن برای افراد |

## Limits

| What | Limit |
| --- | --- |
| Slots per poll | 30 |
| Participants per poll | 100 |
| Open polls per organizer | 50 |
| Deadline | up to 180 days ahead |
| Slots' span | within 92 days of each other (the availability range) |
| Suggest range | 92 days, 10 results |

## Tests

- **Core:** points, eligibility (required, quorum, unranked doesn't count), ordering and ties, suggest (bounds, required people, no overlapping picks), rank renumbering.
- **Server:**
  - Visibility: non-participants get 404 on every route.
  - Lifecycle: open needs 2 slots and a participant; answers only while open; the deadline job closes due polls; reopen; cancel.
  - Finalize: the organizer's event in the chosen calendar, copies only for people who ranked the slot, `poll_id` set, notifications once each.
  - Holds: in occurrences for the organizer only, in their availability, gone after close.
  - Prefill matches the availability engine, including grants (a calendar shared at freebusy counts).
- **Web:** the ballot (pre-filled rows, buttons and keyboard drag, save), the editor (people and circles, quorum, adding and removing slots, suggest), results (recommended row, ineligible reason, finalize confirm).
- **E2e:** two users; one creates a poll with three times, the other ranks two and marks one Can't; the organizer picks the recommended time; both see the event.

## Delivery

7a in three pull requests:

1. **7a-1** Data, scoring, API, deadline job, notifications, holds in availability and occurrences.
2. **7a-2** Polls page, editor (with Suggest times) and the mini week grid.
3. **7a-3** Ballot, results, finalize, holds in the views, e2e.

## Open questions

1. Should participants see each other's answers by name, or only totals until the poll is finalized?
2. Should the deadline finalize automatically to the recommended slot when every participant has answered?
3. Should a copy follow the organizer's event when the organizer moves it after finalizing (7a: it doesn't)?
4. Should holds also block the slot for members who opt in (left out of 7a)?
