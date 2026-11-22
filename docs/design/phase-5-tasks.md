# Phase 5: tasks

Status: 5a (tasks, projects, tags, subtasks and the lists) built in the `phase-5a-tasks` PR, 2026-11-22. 5b (reminders on tasks and time-blocking) built in the `phase-5b-task-reminders-blocks` PR, 2026-11-22. 5c (Todoist import) built in the `phase-5c-todoist-import` PR, 2026-11-22.

## Scope

| Part | What |
| --- | --- |
| 5a | Tasks with a title, notes, due date (and optional time), priority, project, tags and subtasks; repeating tasks; the Inbox, Today, Upcoming and Completed lists, and a list per project and per tag; quick add with dates ("Buy milk tomorrow"); tasks in the JSON export |
| 5b | Reminders on tasks, through the 4a/4b delivery job and channels; time-blocking a task onto the calendar |
| 5c | Import from Todoist |

Out of scope for phase 5: syncing tasks with anything (CalDAV VTODO, Google Tasks, Microsoft To Do, Todoist). That is "after v1" in the product definition. The model below keeps a VTODO mapping possible. Also out: manual ordering by drag, sections inside projects, task comments and attachments, sharing tasks, and search (phase 9's full-text search covers tasks).

## Data model (5a)

| Table | Columns | Notes |
| --- | --- | --- |
| `projects` | `owner_user_id`, `name`, `color` (hex or null) | Names are unique per user, ignoring case. At most 300 per user |
| `tags` | `owner_user_id`, `name` | Unique per user, ignoring case. Created by naming them on a task. At most 500 per user |
| `tasks` | `owner_user_id`, `uid`, `project_id` (null for the Inbox; set null when the project is deleted), `parent_id` (cascades), `title`, `notes`, `priority` (0 to 3), `due_date` (date), `due_time` (time, null for date-only), `tz`, `rrule`, `completed_at` | Checks: a due time needs a due date, and so does a repeat rule |
| `task_tags` | `task_id`, `tag_id` | Both cascade |

**Due is a wall date, not an instant.** A task is "due Friday" or "due Friday 17:00 in Europe/London". That is how people think about tasks, and it is what VTODO (`DUE;VALUE=DATE` or `DUE;TZID=…`) and Todoist (`due.date`, `due.datetime`, `due.timezone`) store, so both map without loss. `tz` is the zone the task was made in (the home zone, else the browser's). A date-only due is the same date in every zone; a timed due is shown in the viewer's zone, so it can land on another date for someone viewing from far away.

**Status is `completed_at`.** Null is open (VTODO `NEEDS-ACTION`), a time is done (`COMPLETED`, and the `COMPLETED` property). `IN-PROCESS` and `CANCELLED` have no Homa equivalent yet; a status column can come with VTODO sync if it is needed.

**No separate start date.** VTODO has `DTSTART` beside `DUE`. Homa's equivalent is the time block from 5b: the block's start is when you plan to do it, the due is when it must be done. A sync later writes `DTSTART` from the block.

**Priority** is 0 none, 1 low, 2 medium, 3 high. VTODO maps high to 1, medium to 5 and low to 9 (RFC 5545 says 1 to 4, 5 and 6 to 9); Todoist's p1 (API value 4) is high, p2 medium, p3 low and p4 (value 1) none.

**Subtasks are one level deep.** A subtask has its parent's project, moves with it, and is deleted with it. A task that has subtasks can't become a subtask, and a subtask can't have its own. One level covers most real use and keeps the lists simple; Todoist allows four, and 5c flattens deeper levels onto the top-level ancestor. VTODO's `RELATED-TO;RELTYPE=PARENT` maps to `parent_id`.

**`uid`** defaults to a random UUID. It is the VTODO `UID` later, and the key an import matches on to avoid duplicates.

## Repeating tasks (in 5a)

A repeating task is one row with an `rrule` (daily, weekly, monthly or yearly, like standalone reminders; other rules from an import are kept and shown as "Custom rule"). It needs a due date. Completing it does not mark it done: it moves the due to the next occurrence, keeping any time of day, and its subtasks open again. This is how Todoist and Apple Reminders behave, and it matches VTODO, where a repeating `VTODO` is one component whose `DUE` moves on.

The next due is the first occurrence after the current due that is not before today (in the task's zone). So a daily task that is three days overdue lands on today, not on the day after its old due. Date-only dues repeat by date; timed ones repeat in wall-clock time in their zone, so 09:00 stays 09:00 across a clock change. A rule that ends (`COUNT`, `UNTIL`) completes the task for good on its last occurrence. The rule lives in `nextDue` in `@homa/core`.

Repeating "from the completion date" (Todoist's `every!`) is not supported; see the open questions.

## API (5a)

- `GET /api/tasks` lists every open task (subtasks too), soonest due first, then by priority and age. `?completed=true` lists the 200 most recently completed instead.
- `POST /api/tasks` `{ title, tz, notes?, projectId?, parentId?, tags?, priority?, dueDate?, dueTime?, rrule? }`. Omitted fields are empty: the Inbox, no tags, no due.
- `PATCH /api/tasks/{id}` changes any of those fields; `tags` replaces the whole set. An empty body returns the task unchanged.
- `POST /api/tasks/{id}/complete` completes a task and its open subtasks, or moves a repeating one on. Completing a completed task changes nothing. `POST /api/tasks/{id}/reopen` opens it again, and its parent with it, so an open subtask never sits under a completed task.
- `DELETE /api/tasks/{id}` deletes a task and its subtasks.
- `GET|POST /api/projects`, `PATCH|DELETE /api/projects/{id}` (`{ name, color }`). Deleting a project moves its tasks to the Inbox.
- `GET /api/tags`, `PATCH /api/tags/{id}` (rename), `DELETE /api/tags/{id}` (it comes off every task). Tags are made by naming them on a task.

Every route needs a session. Another user's task, project or tag is a 404, and naming another user's project or task as a project or parent is a 400. `GET /api/export` now includes `projects`, `tags` and `tasks`.

**Why one list of open tasks.** The lists (Inbox, Today, Upcoming, per project, per tag) are cuts of the same open tasks, and the open set is bounded (5,000 per user). The web app fetches it once and derives every list in `@/services/tasks`, so completing or moving a task updates every list and the nav counts at once, and "today" is the viewer's own date with no zone round trip. Server-side filters (`?project=`, `?due_before=`) are cheap to add when an API client or the MCP server needs them.

## Lists and web (5a)

A Tasks page at `/tasks`, linked from a checklist icon in the header and from the command palette.

| List | Shows |
| --- | --- |
| Inbox | Top-level open tasks with no project, subtasks nested under them |
| Today (the default) | Tasks due today or earlier, any level: an "Overdue" section, then today. A timed task due earlier today counts as overdue |
| Upcoming | Tasks due after today, grouped by day |
| Completed | The 200 most recently completed |
| Project | Its top-level open tasks, subtasks nested |
| Tag (`?tag=name`) | Open tasks with the tag, any level |

The lists that show subtasks on their own name the parent ("In Plant bulbs"); lists outside a project name the task's project. Day headings and due dates show the Solar Hijri date beside the Gregorian one when the user turned it on, as the calendar does. The checkbox ring takes the priority's color. Inbox and Today show counts in the nav.

**Quick add.** The field at the top of each list adds a task there: in a project it goes in the project, on a tag's list it gets the tag, and on Today it is due today. The line goes through the event quick-add parser (`parseQuickAdd`, phase 4c), so "Buy milk tomorrow", "Call the bank mon 3pm", "Water plants every day" and the Farsi forms set the due and repeat, and a preview under the field shows the due before Enter. A line without a date has no due (except on Today). The parser's durations and "remind me" mean nothing for a task and are ignored. Priority and tag markers in the line ("p1", "#errand") are not parsed yet.

**Editing** is a drawer, as for reminders: title, notes, project (subtasks follow their parent), due date and optional time, repeat, priority, tags (with suggestions from existing ones), the subtasks with a checkbox each and a field to add one, and delete. The due date is the browser's date input, so it is Gregorian; the Solar Hijri date shows under it. New projects and tags have their own drawers. On phones the nav becomes a "List" select at the top.

## Reminders on tasks (5b)

A task's reminders are rows in 4a's `reminders` table with the new `task_id` column (cascading), so they go through the same delivery job, notifications, snooze and channels as event and standalone reminders. A row has exactly one of `event_id`, `task_id` or neither (standalone); a check enforces it. `notifications.task_id` (cascading) records which task fired it.

| Rule | Why |
| --- | --- |
| Reminders are offsets in minutes before the due, like an event's (at most 5, up to 4 weeks) | One chip picker for events and tasks |
| A date-only due counts from 09:00 in the task's zone; whole-day offsets keep that time across a clock change | "Remind me a day before" a Friday task means Thursday morning, not Thursday midnight |
| A reminder needs a due date (a 400 otherwise); removing the due removes them | Nothing to count back from |
| Each reminder keeps one `next_fire_at`: the fire time for the current due, null once fired, or when the task is completed, or when the fire time is past (with 4a's catch-up window) | A task has one due at a time, so there's no series to expand |
| Changing the due or the offsets, completing, and reopening recompute `next_fire_at`. Completing a repeating task moves the due, so its reminders fire again for the next one | Same rule in one place: `syncTaskReminders` |

The delivery job claims due task reminders (`claimDueTaskReminders`, `FOR UPDATE SKIP LOCKED`, like the other kinds) and makes one notification each, with the task's title and its due as the start (a date-only due shows as all-day). The dedupe key is `task:{taskId}:{due}:{fireAt}`, so a reminder fires once per due even if two workers race.

Notifications and channels get a third kind, `task`. A channel's `reminder_kinds` can include `task`; the migration adds it to every channel that already takes standalone reminders, and new channels take all three. In the bell, **Done** on a task notification also completes the task (a repeating one moves on). Snooze works as for any notification.

## Time-blocking (5b)

**Decision: a block is an ordinary event linked from the task**, `tasks.scheduled_event_id` (references `events`, set null when the event goes), not a separate "block" record and not an `events.source` column.

- An event shows in every calendar view, can be dragged and resized there, and syncs to a connected calendar as busy time, with no new code. A separate record would need its own rendering, sync and availability rules.
- The link sits on the task because a task has at most one block, and the event needs to know nothing about it. Deleting the event on the calendar (or on the remote side, through sync) just unlinks it. `events.source` was dropped from the plan: the link already says which events are blocks.
- The block's start is the VTODO `DTSTART` a later sync writes.

| API | Does |
| --- | --- |
| `PUT /api/tasks/{id}/block` `{ calendarId, start, end }` | Makes the event (named after the task, its notes as the description, in the task's zone) and links it; a task with a block moves it instead. At most 24 hours, end after start. An unknown calendar is a 400 and a read-only one a 403, as for events |
| `DELETE /api/tasks/{id}/block` | Deletes the event |

A task's answer includes `block: { eventId, calendarId, start, end }` or null. Occurrences include `taskId` and `taskDone`, and the calendar strikes through the block of a completed task (with "Task done" for screen readers). Moving or resizing the block on the calendar is an ordinary event edit; the task shows the new time.

In the web app the task drawer has a **Time block** section: day, start, length (15 minutes to 4 hours) and a writable calendar (the last one used for events), with **Block time**, **Move the block** and **Remove the block**. It starts at the task's due time, else the next whole hour. Rows show "Blocked Today, 10:00 – 11:00" and a bell when the task has reminders.

Not in 5b: dragging a task from the list onto the calendar (the drawer's form does the same job, and drag between two pages needs a split view first), and blocking a repeating task's every occurrence.

## Todoist import (5c)

**Decision: import Todoist's CSV files, not its API.** Checked 2026-11-22 against Todoist's help center and developer docs:

| Route | What it needs | Verdict |
| --- | --- | --- |
| Project CSV ("Export as a template" → CSV) | Nothing; every plan, one project per file | Used |
| Backup ZIP (Settings → Backups) | Pro or Business; a ZIP with the same CSV per active project | Works: unzip and choose all the files |
| REST API with a personal token | The user pastes a token from Settings → Integrations → Developer | Not now; see below |
| REST API with OAuth | An app registered in Todoist's App Management Console, and Todoist's brand rules ("x for Todoist", a not-affiliated notice) | No: a self-hosted app can't share one registration safely |

A personal token would work without registration, but asking people to paste a credential with full access to their Todoist account into another app is more than an import needs, and the CSV carries the same fields except completed tasks. The API stays an open question if people want completed history or comments.

**The CSV.** Columns `TYPE` (`task`, `section`, `note`), `CONTENT`, `DESCRIPTION`, `PRIORITY` (1 is p1, the highest), `INDENT` (1 top level, 2 a subtask, 3 a sub-subtask), `AUTHOR`, `RESPONSIBLE`, `DATE` (the due as Todoist writes it, natural language such as "every mon" or "Dec 5 17:00"), `DATE_LANG`, `TIMEZONE`, `DURATION`, `DURATION_UNIT`, `DEADLINE`, `DEADLINE_LANG`, plus `IS_COLLAPSED` on sections and a `meta` row. Columns are found by name, so extra or missing ones don't matter beyond `TYPE` and `CONTENT`.

| Todoist | Homa |
| --- | --- |
| The file ("Garden.csv") | The project "Garden", matched by name ignoring case, else created |
| `task` row | A task; `CONTENT` is the title |
| `@label` words in `CONTENT` | Tags, taken out of the title |
| `DESCRIPTION` | Notes |
| `note` rows (comments) | Added to the notes of the task above them |
| `PRIORITY` 1, 2, 3, 4 | High, medium, low, none |
| `INDENT` 2 | A subtask of the task above. Deeper levels are flattened onto the top-level task (5a keeps one level) |
| `DATE` | Read with the quick-add parser (the same English and Farsi grammar), in the row's `TIMEZONE` if it is a valid zone, else the importer's home zone. Only a string read completely becomes the due and repeat rule; anything else ("every other full moon", "12/05/2026", which is ambiguous) is kept in the notes as "Todoist date: …" and counted in the summary, never guessed |
| `section` rows | Counted and left out; their tasks are imported (Homa has no sections) |
| `AUTHOR`, `RESPONSIBLE`, `DURATION`, `DEADLINE` | Ignored |

**Re-importing** adds only what is missing: an open task with the same title, project and parent is skipped, and a new subtask under an existing task goes under it. Completed tasks are never in Todoist's export.

**API.** `POST /api/tasks/import/todoist` `{ tz, files: [{ name, csv }] }`: up to 300 files and 5 MB, all in one transaction. A file that isn't a Todoist CSV refuses the whole batch with its name in the message, and so does going over the project or open-task limits. The answer is `{ createdProjects, imported, skipped, unreadDates, sections }`. The web app reads the chosen files in the browser and sends their text, so the server needs no multipart or ZIP handling.

**Web.** Settings → Import from Todoist: a file picker for one or more `.csv` files, with the steps to export from Todoist, and the summary afterwards.

## Limits

| What | Limit |
| --- | --- |
| Open tasks per user (subtasks included) | 5,000 |
| Completed tasks listed | 200 newest |
| Title | 500 characters |
| Notes | 10,000 characters |
| Projects per user | 300 |
| Project name | 100 characters |
| Tags per user | 500 |
| Tag name | 50 characters |
| Tags per task | 20 |
| Subtask depth | 1 |

## Open questions

- Manual ordering (drag to reorder within a list) needs a position column; today lists sort by due, priority and age.
- Repeat from the completion date (Todoist's `every!`, "3 days after I last did it").
- Priority and tag markers in quick add ("p1", "#errand", "!!").
- Deeper subtasks, if the Todoist import shows people rely on them.
- Importing through Todoist's API (completed tasks, comments), and reading a backup ZIP directly.
- Todoist's `DEADLINE` column (a hard date beside the due) and `DURATION` (could prefill a time block).
- Should Today and Upcoming include tasks from the time blocks (5b) that are scheduled today but due later?
- Drag a task from the list onto the calendar, once there's a split tasks-and-calendar view.
- Should a task's reminders also be able to count from its time block's start?
- Server-side list filters for API and MCP clients.
