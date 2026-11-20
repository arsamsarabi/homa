# Changelog

Changes that need people running Homa to do something on upgrade go under `### Breaking` in `[Unreleased]`, with the steps to take.

## [Unreleased]

Quick add: type one line such as "Dentist tue 3pm 45m", "Holiday 3-7 Dec", "Team sync every Monday 10am" or "جلسه فردا ساعت ۳ عصر" in the field under the calendar toolbar (press Q to focus it). A preview shows the date, time, length, repeat and calendar; Enter creates the event in the calendar you last created one in, and Shift+Enter (or "More options") opens the full editor filled in. English and Farsi, including Persian digits and Jalali dates like "۱۵ آذر". No migration.

Microsoft accounts (Outlook.com, Microsoft 365) can be connected and synced both ways, once the instance has its own Entra ID app: set `HOMA_MICROSOFT_CLIENT_ID` and `HOMA_MICROSOFT_CLIENT_SECRET` (see `docs/self-hosting/microsoft.md`). Without them nothing changes.

A connected calendar deleted on Google or the CalDAV server (or no longer shared with the account) no longer fails its connection's sync: Settings → Connected calendars says which one went, lists it in Choose calendars as deleted, and offers to remove it from Homa. Migration `0009_calendar_remote_missing` adds `calendars.remote_missing`.
