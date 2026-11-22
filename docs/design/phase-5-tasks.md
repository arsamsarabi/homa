# Phase 5: tasks

Status: 5a (tasks, projects, tags, subtasks and the lists) built in the `phase-5a-tasks` PR, 2026-11-22. 5b (reminders on tasks and time-blocking) and 5c (Todoist import) follow in their own PRs and fill in their sections below.

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

To be designed in the 5b PR, reusing 4a's `reminders`, `notifications` and `notification_deliveries` and 4b's channels.

## Time-blocking (5b)

To be designed in the 5b PR. The direction: dragging a task onto the calendar makes a linked event (`events.source = 'task_block'`, `tasks.scheduled_event_id`), rather than a separate "block" record, so the block shows in every view, syncs to connected calendars as busy time, and later counts in availability like any event.

## Todoist import (5c)

To be designed in the 5c PR, after checking Todoist's current export formats and API terms.

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
- Should Today and Upcoming include tasks from the time blocks (5b) that are scheduled today but due later?
- Server-side list filters for API and MCP clients.
