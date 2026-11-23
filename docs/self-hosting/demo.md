# Demo mode

`HOMA_DEMO=true` turns an instance into a public demo: made-up data, one shared account, and nothing that leaves the server. The public demo at `demo.homa.day` runs this way. You don't need it to run Homa for yourself.

## What it does

- On first start, with no accounts yet, the server seeds a demo account (`demo@example.com`, password `homa-demo`) instead of waiting for an admin. It's the admin, so visitors can see the admin pages too.
- The seed is laid out around today, in `Europe/London`, with the Jalali calendar shown second: three calendars, recurring and one-off events, an all-day trip, projects with tasks and subtasks, a time-blocked task, a repeating task and standalone reminders. A few titles are in Farsi.
- The sign-in page fills in the shared account and says so. Every page shows a note that this is a demo that resets every night.
- Visitors can sign in and out and use the calendar, tasks, reminders, settings and imports. Everything else answers `403`:
  - sign-up, password and email changes, deleting the account, revoking sessions, and Better Auth's admin actions (`/api/auth/*` except signing in and out);
  - connected calendars, ICS subscriptions and holiday calendars (`/api/connections`), including the Google and Microsoft sign-in redirects;
  - notification channels (email, ntfy, Gotify, webhooks) and web push subscriptions;
  - changing the instance settings.
- The server refuses to start in demo mode with `HOMA_SMTP_URL`, `HOMA_GOOGLE_*` or `HOMA_MICROSOFT_*` set, so nothing can be sent out even by mistake.

Everyone shares the account, so visitors see each other's changes until the next reset.

## Resetting

The reset deletes every account and everything they own, then seeds the demo again. Visitors are signed out. Run it in the `api` container:

```bash
docker compose exec -T api bun apps/server/src/demo-reset.ts
```

It refuses to run unless `HOMA_DEMO=true`. Schedule it nightly with cron or a systemd timer on the host, for example:

```cron
0 3 * * * cd /opt/homa-demo && docker compose exec -T api bun apps/server/src/demo-reset.ts
```

In development: `HOMA_DEMO=true bun run --cwd apps/server demo:reset` with `DATABASE_URL` and `BETTER_AUTH_SECRET` set.
