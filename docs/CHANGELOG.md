# Changelog

Changes that need people running Homa to do something on upgrade go under `### Breaking` in `[Unreleased]`, with the steps to take.

## [Unreleased]

A connected calendar deleted on Google or the CalDAV server (or no longer shared with the account) no longer fails its connection's sync: Settings → Connected calendars says which one went, lists it in Choose calendars as deleted, and offers to remove it from Homa. Migration `0008_calendar_remote_missing` adds `calendars.remote_missing`.
