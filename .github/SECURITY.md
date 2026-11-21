# Security policy

## Supported versions

Homa is pre-v1. There are no releases or published images yet: people build it from this repository. Security fixes land on `main`.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older commits | No: update to the latest `main` |

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. If that button isn't there, or you have no GitHub account, email **arsamsarabi@me.com** instead.

Include:

- What the problem is and what an attacker could do with it: read, change or take over what, and with what access to start with
- The commit you tested (`git rev-parse --short HEAD`)
- How the instance was set up, if it matters: behind a reverse proxy or not, which connections are in use (ICS, CalDAV, Google, Microsoft), and any non-default settings such as `HOMA_SYNC_ALLOW_PRIVATE_NETWORKS`
- Steps to reproduce, or a proof of concept

## What to expect

- An acknowledgment within a few days.
- Updates while the report is triaged and, if needed, fixed.
- Once a fix is on `main`, a GitHub security advisory describing it, with credit to you if you'd like.

If the report isn't accepted (it doesn't reproduce, or it describes documented behavior), you'll get the reason.

## Scope

In scope:

- Signing in as someone else, or getting around sessions, the first-run setup code, or closed sign-ups
- Reading or changing another user's calendars, events, connections or settings, or using the admin settings without being an admin
- Exposing connected calendars' saved credentials (feed URLs, CalDAV app passwords, Google or Microsoft tokens), or weaknesses in how they're encrypted
- Making the server fetch loopback, private-network or cloud metadata addresses through a feed or CalDAV URL while private networks aren't allowed
- Cross-site scripting or request forgery, including through event text from an imported or synced calendar
- Injection into SQL or into data sent to CalDAV, Google or Microsoft
- `.ics` imports or feeds that get past the documented limits and exhaust the server
- Problems in the Dockerfile, Compose file or CI workflows that would compromise people who build and run Homa

Out of scope (report these as normal bugs):

- Setups that go against the [self-hosting docs](../docs/self-hosting/quick-start.md), such as test-only settings (`HOMA_SETUP_CODE`, `HOMA_AUTH_RATE_LIMIT=false`) in production, or a published Postgres port
- What an instance admin can do by design
- Attacks that need an already compromised host, browser or account
- Denial of service through request volume alone
