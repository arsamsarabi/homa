# Phase 6: sharing and people

Status: design, 2026-11-23. 6a (invites, the directory, circles) built in the `phase-6a-people` PR, 2026-11-23.

## Scope

| Part | What |
| --- | --- |
| 6a | People on one instance: invite links (emailed when email is set up), who may invite, a people directory, and circles |
| 6b | Calendar grants to a person or a circle, a per-calendar default, the sharing preset picked at onboarding, shared calendars in the views, and grant checks on every read and write path |
| 6c | The availability engine: permission-aware free/busy for a set of people over a range, the API phase 7 polls call |
| 6d | Sign-in with OIDC (one provider from the environment) and passkeys |

6a and 6b come first and matter most: they are what makes a second person on the instance useful and safe. 6c depends on 6b. 6d is independent of the others.

Out of scope for phase 6:

- Sharing tasks, projects, reminders or routines. Only calendars are shared.
- Email-only contacts in circles. Circles hold people with an account on the instance; guests by email arrive with polls (phase 7), which is where they are needed.
- Event invitations and attendees (`attendees`, RSVP, iTIP email). Phase 7 finalizes polls into events and sends `.ics` invites; general invitations come after that.
- Booking pages (phase 9), the CalDAV server's view of shared calendars (phase 9, it must use the same grant check), search (phase 9, same).
- Several OIDC providers, SAML, SCIM, and managing OIDC from the admin UI.
- Two-factor authentication (Better Auth has a plugin; it can come with phase 10 hardening).
- Notifying someone that a calendar was shared with them. The calendar simply appears.

## Decisions

Each of these is a call made without Arsam; any can be overturned.

1. **No Better Auth organization plugin.** An instance is already one community. The plugin models organizations with members, roles and teams; circles are a person's private lists ("my family"), not shared organizations, and the instance needs exactly one membership: having an account. Invitations in that plugin are invitations into an organization, so they don't fit either. Homa keeps a small `invites` table instead, and uses Better Auth's sign-up for the account itself.
2. **Invites bypass closed sign-ups.** "Closed" now means invite-only, which is what a family instance wants. No third sign-up mode.
3. **Only admins invite, by default.** An instance setting, `invites`, is `admins` or `everyone`.
4. **Invite links are single use and last 7 days.** The token is 32 random bytes, shown once, stored as its SHA-256 hash. An invite may name an email; then only that address can use it. When email is set up and the invite names an address, Homa emails the link; otherwise the inviter copies it.
5. **An emailed invite confirms the address.** Signing up through a link that was emailed to that address marks the account confirmed, since opening the link proves the inbox. A copied link doesn't.
6. **Everyone on an instance can see everyone's name and email** (`GET /api/people`). Picking circle members and grant targets needs it, and the launch audience is family and friends. A hosted instance would need a narrower directory; see open questions.
7. **Circles are private to their owner.** Members aren't told they are in a circle and can't see it. A circle only means something to its owner's grants (and later polls).
8. **Four levels:** `none`, `freebusy`, `read`, `edit`. `none` exists so a person or circle can be shut out of a calendar the default would otherwise show them.
9. **Resolution order:** owner; else a grant to the person; else the highest grant to any of the owner's circles the person is in; else the calendar's own default; else the owner's sharing preset. The first one that is set wins, so a person grant of `none` beats a circle grant of `read`.
10. **Defaults never grant `edit`.** The preset is `private`, `freebusy` or `details` (stored as `read`); the per-calendar default is `none`, `freebusy`, `read` or null (follow the preset). `edit` only comes from a grant to a person or a circle.
11. **Existing accounts start `private`,** so upgrading shares nothing. The onboarding page preselects **Free/busy**, the choice it already shows today, and saves it.
12. **Shared calendars appear in the viewer's calendar list and views, shown by default.** The viewer can hide one; that choice is stored per viewer (`shared_calendar_prefs`), not on the calendar. The viewer can't rename, recolor, delete or import into it.
13. **Free/busy means busy blocks only.** At `freebusy` an occurrence comes back with an empty title, no description or location, `recurring: false`, `overridden: false` and no task link; its `eventId` is kept (a random id with no content) so the client can key it, but `GET /api/events/{id}` answers 404.
14. **`edit` lets the grantee create, change and delete events in that calendar.** The events stay the calendar owner's (`owner_user_id`), sync through the owner's connection, and can't be moved into a calendar with another owner. Reminders stay personal: a grantee sees `reminders: []` on someone else's event and can't set them, and only the owner is reminded.
15. **The export holds only your own data.** Shared calendars are not exported by a grantee.
16. **Free/busy ignores all-day events.** Holidays, birthdays and "working from home" are usually all-day and don't block time, which is Google's and Outlook's default. A "busy" flag per event can come later.
17. **OIDC is configured from the environment only.** The client secret stays out of the database; the admin page shows whether single sign-on is on and its provider name.
18. **OIDC follows the sign-up setting.** A first OIDC sign-in creates an account only when sign-ups are open (or with an invite). It links to an existing account with the same email only when the provider says the email is verified.
19. **Passkeys use Better Auth's passkey plugin** (`@better-auth/passkey`), with the relying party id from `HOMA_URL`'s host. A passkey is added from Settings once signed in; it doesn't replace the password.

## Data model

Migrations `0015_people` (6a), then one each for 6b and 6d. Phase 6 adds no new columns to `events` or `event_instances`: both already carry `owner_user_id` and `calendar_id`, which is all a grant check needs.

| Table | Columns | Notes |
| --- | --- | --- |
| `invites` (6a) | `id`, `token_hash` (unique), `email` (null for anyone), `created_by` (user, cascade), `expires_at`, `emailed` (bool), `used_at`, `used_by` (user, set null), `created_at` | A pending invite is unused and unexpired. At most 50 pending per inviter |
| `instance_settings.invites` (6a) | `admins` or `everyone` | Default `admins` |
| `circles` (6a) | `id`, `owner_user_id` (cascade), `name`, `created_at`, `updated_at` | Names unique per owner, ignoring case. At most 50 per user |
| `circle_members` (6a) | `circle_id` (cascade), `user_id` (cascade) | Primary key on both. At most 200 per circle. The owner can't be a member of their own circle |
| `calendar_grants` (6b) | `id`, `calendar_id` (cascade), `grantee_user_id` (cascade) or `circle_id` (cascade), `level` | A check keeps exactly one target set, and `level` in `none`, `freebusy`, `read`, `edit`. Unique on (calendar, person) and (calendar, circle). The circle must be the calendar owner's |
| `calendars.default_access` (6b) | null, `none`, `freebusy`, `read` | Null follows the owner's preset |
| `users.sharing_preset` (6b) | `private`, `freebusy`, `read` | Default `private` |
| `shared_calendar_prefs` (6b) | `user_id` (cascade), `calendar_id` (cascade), `hidden` | Primary key on both. A missing row means shown |
| `passkeys` (6d) | Better Auth's passkey schema | |

## Permission levels

| Level | Calendar list | Occurrences | Event detail | Write |
| --- | --- | --- | --- | --- |
| `none` | not listed | nothing | 404 | 404 |
| `freebusy` | listed, `access: freebusy` | start, end, all-day, zone; empty title | 404 | 404 |
| `read` | listed, `access: read` | everything the owner sees except reminders and task links | yes, `reminders: []` | 404 on change, 400 when naming it as an event's calendar |
| `edit` | listed, `access: edit` | as `read` | as `read` | create, change, delete events (read-only calendars stay read-only) |
| owner | `access: owner` | everything | everything | everything |

**One function decides.** `repo.accessibleCalendars(db, viewerId, calendarIds?)` runs one SQL query that returns, for every calendar the viewer doesn't own, the effective level by the resolution order above, and only rows at `freebusy` or higher. Every service that reads or writes another user's calendar data goes through it (or through `calendarAccess(db, viewerId, calendarId)` for one calendar). Nothing reads another owner's rows by id alone.

## Invite flow (6a)

1. An admin (or anyone, if `invites` is `everyone`) opens Settings → People and creates an invite, optionally naming an email. `POST /api/invites { email? }` answers with the invite and its link `${HOMA_URL}/sign-up?invite=<token>`, once. If email is set up and an address is named, Homa emails the link (English or Farsi, the inviter's language) and says so.
2. The invitee opens the link. `GET /api/invite-lookup?token=` (no session) answers with the instance name, the inviter's name and the named email, or 404 for an unknown, used or expired token. The sign-up page shows "Ada invited you to Homa" and fills and locks the email.
3. Sign-up sends the token in the `x-homa-invite` header. Better Auth's user `create.before` hook claims the invite in one `UPDATE … WHERE used_at IS NULL AND expires_at > now() AND token_hash = $1 RETURNING` (so two sign-ups can't share one), checks the email matches when the invite names one, and admits the account even when sign-ups are closed. An emailed invite to the same address marks the account confirmed.
4. The inviter sees the invite as used, by whom. Pending invites can be revoked (`DELETE /api/invites/{id}`); used ones stay as a record until their inviter is deleted.

`GET /api/invites` lists the caller's invites; an admin sees everyone's. Admins can revoke any invite; others only their own.

## Circles (6a)

`GET|POST /api/circles`, `PATCH|DELETE /api/circles/{id}` (`{ name }`), `PUT /api/circles/{id}/members` (`{ userIds }`, replaces the set). Another user's circle is a 404. Members must be people on the instance (400 otherwise). Deleting a circle deletes its grants.

`GET /api/people` lists everyone else on the instance (`id`, `name`, `email`), banned accounts left out, sorted by name.

Web: Settings → People has the invites (create, copy link, revoke, see who joined) and the circles (create, rename, delete, pick members from the directory).

## Grants and their enforcement (6b)

API:

- `GET /api/calendars` adds `access` (`owner`, `freebusy`, `read`, `edit`) and `owner` (`{ id, name }`) to each calendar, and lists the calendars shared with the caller after their own. `hidden` on a shared calendar is the caller's own choice.
- `PATCH /api/calendars/{id}` on a shared calendar accepts only `hidden` (stored in `shared_calendar_prefs`); any other field is a 404, as before for calendars you can't see.
- `GET /api/calendars/{id}/grants`, `PUT /api/calendars/{id}/grants` (`{ defaultAccess, grants: [{ userId | circleId, level }] }`, replaces the set). Owner only.
- `PATCH /api/settings` takes `sharingPreset`; `GET /api/settings` returns it.

Each read and write path, and what it checks:

| Path | Rule | Tested |
| --- | --- | --- |
| `GET /api/calendars` | own, plus `accessibleCalendars` | a user with no grant sees only their own |
| `GET /api/occurrences` | own calendars, plus shared ones at `freebusy`+; `freebusy` ones stripped to times in the response mapper | no title, description, location, task id at `freebusy`; nothing at `none` or without a grant |
| `GET /api/events/{id}` | owner, or `read`+ on its calendar | 404 at `freebusy` and without a grant |
| `POST /api/events`, `PATCH`, `DELETE /api/events/{id}` | owner, or `edit` on its calendar (and on the target calendar when moving; same owner) | 404 at `read`; can't move into another owner's calendar |
| `PUT /api/events/{id}/reminders` | owner only | 404 for a grantee |
| `POST /api/calendars/{id}/import` | owner only | 404 for a grantee |
| `GET /api/export` | own rows only (`owner_user_id`) | a grantee's export has none of the owner's events |
| Reminder delivery, notifications, channels | owner of the event or reminder only (unchanged) | a grantee is never notified of the owner's event |
| Task blocks on occurrences | owner only | no `taskId` on a shared occurrence |
| `GET /api/availability` (6c) | `accessibleCalendars` at `freebusy`+ | busy times only, nothing from unshared calendars |
| Search, ICS feeds, CalDAV server | don't exist yet | phase 9 must use `accessibleCalendars` |

Web:

- The calendar filter groups calendars by owner ("Shared by Ada"), with the same show and hide toggles.
- A `freebusy` occurrence shows as "Busy" in the owner's calendar color, striped, and clicking it shows a small read-only card (owner, times). A `read` one opens the existing read-only details with the owner's name. An `edit` one opens the editor.
- The event editor's calendar picker lists your calendars and those shared with you at `edit`, grouped by owner.
- Settings → Calendars → a calendar's drawer gets a **Sharing** section: who can see it (the default, then people and circles with a level each).
- Settings gets a **Sharing** default (the preset), and onboarding saves the preset it asks for.

## Availability API (6c)

Phase 7 polls, auto-suggest, the plan-my-week wizard and booking pages all ask the same question: "when are these people busy between A and B, as far as I'm allowed to know?".

`POST /api/availability`:

```json
{ "from": "2026-12-01T00:00:00Z", "to": "2026-12-08T00:00:00Z", "userIds": ["u1", "u2"] }
```

```json
{
  "from": "…", "to": "…",
  "people": [
    { "userId": "u1", "shared": true, "busy": [{ "start": "…", "end": "…" }] },
    { "userId": "u2", "shared": false, "busy": [] }
  ]
}
```

- `userIds` may include the caller (all their calendars count, hidden ones too). At most 50 people and 92 days; unknown ids are a 400, so ids can't be probed for existence beyond the directory everyone already sees.
- For anyone else only calendars the caller can see at `freebusy` or higher count. `shared: false` means none do, so phase 7 can say "Bob shares nothing" instead of "Bob is free".
- Busy intervals are clipped to the range, merged (touching and overlapping ones join) and sorted. They carry no titles and no calendar ids, whatever the level, so the response shape never depends on grants.
- All-day events don't count (decision 16).
- The pure part, `mergeBusy(intervals, from, to)` and `freeSlots(busy, from, to, minMinutes)`, lives in `@homa/core/availability` with unit tests. The service reuses the occurrence reader (cache plus expansion past the horizon, overrides applied), so free/busy and the views can't disagree.

Phase 7 adds tentative holds and routine blocks as more inputs to the same merge. No web UI in 6c beyond what 6b shows; the poll views are phase 7's.

## OIDC and passkeys (6d)

OIDC, with Better Auth's `genericOAuth` plugin and one provider id, `oidc`:

| Variable | Meaning |
| --- | --- |
| `HOMA_OIDC_ISSUER` | The issuer URL; Homa reads `/.well-known/openid-configuration` from it |
| `HOMA_OIDC_CLIENT_ID`, `HOMA_OIDC_CLIENT_SECRET` | The client registered with the provider |
| `HOMA_OIDC_NAME` | The button label, "Sign in with …" (default `SSO`) |

All three of issuer, id and secret, or none (startup fails otherwise). The redirect URI to register is `${HOMA_URL}/api/auth/oauth2/callback/oidc`, with scopes `openid email profile`. `GET /api/instance` adds `oidc: { name } | null`; the sign-in page shows the button only then. The admin page shows whether it's on, the provider name and the redirect URI to register (read-only).

Passkeys, with `@better-auth/passkey`: `rpID` is `HOMA_URL`'s host, `rpName` the instance name, origin `HOMA_URL`. Settings → Security lists the account's passkeys (name, added), adds one (the browser's prompt) and removes one. The sign-in page offers "Sign in with a passkey" when the browser supports WebAuthn. No new env vars.

Docs: `docs/self-hosting/environment.md` and a short `docs/self-hosting/sign-in.md` for registering Homa with Authentik, Keycloak, Google or Microsoft as an OIDC client.

## Limits

| What | Limit |
| --- | --- |
| Pending invites per inviter | 50 |
| Invite lifetime | 7 days |
| Circles per user | 50 |
| Members per circle | 200 |
| Grants per calendar | 200 |
| Availability: people, range | 50, 92 days |

## Open questions

1. Is a full directory (everyone sees everyone's name and email) right for the instances you expect, or should non-admins only find people by exact email?
2. Should shared calendars start hidden in the views when they come only from someone's preset (everyone's free/busy can crowd a big instance)?
3. Should a grantee with `edit` be able to set their own reminders on the owner's events (stored per viewer)?
4. Should all-day events be able to count as busy (a per-event or per-calendar flag)?
5. Should the admin be able to see or change other people's sharing? Today nobody can, admins included.
6. Hosted instance: invites and the directory probably need to be scoped to a household; that is a bigger model change, left for after v1.
