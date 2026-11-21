# Google Calendar

People on your instance can connect a Google account and sync its calendars both ways. Google only lets an app reach calendars through an OAuth client registered to it, so each self-hosted instance uses its own. Setting one up takes about ten minutes in the Google Cloud console.

You need:

- `HOMA_URL` set to the address people use to reach Homa, such as `https://homa.example.com`. Google sends people back to it, so it must match exactly.
- `HOMA_ENCRYPTION_KEY` set (see [Environment variables](./environment.md)). Google's tokens are stored encrypted with it.

## 1. Create a project and turn on the Calendar API

1. Open [console.cloud.google.com](https://console.cloud.google.com/) and create a project (or pick one), for example "Homa".
2. Go to **APIs & Services → Library**, search for **Google Calendar API** and click **Enable**.

## 2. Set up the Google Auth Platform

Go to **Google Auth Platform** (in older consoles, **APIs & Services → OAuth consent screen**) and click **Get started** if asked.

- **Branding:** an app name people will recognize (your instance's name), a support email, and your domain under **Authorized domains** (for `https://homa.example.com`, add `example.com`).
- **Audience:** choose **External** (or **Internal** if everyone is in your Google Workspace organization). While the app is in **Testing**, only the accounts under **Test users** can connect: add each person's Google address there, at most 100.
- **Data access:** click **Add or remove scopes** and add `https://www.googleapis.com/auth/calendar` (see, edit, share and permanently delete all calendars). Homa also asks for `openid` and `email`, to label the connection with the account's address; those need no setup.

## 3. Create the OAuth client

Go to **Clients → Create client** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**):

- **Application type:** Web application.
- **Authorized redirect URIs:** your `HOMA_URL` followed by `/api/connections/google/callback`, for example `https://homa.example.com/api/connections/google/callback`. For local development, `http://localhost:5180/api/connections/google/callback`.

Copy the client ID and the client secret.

## 4. Give them to Homa

Add both to `deploy/docker/.env` and restart:

```sh
HOMA_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
HOMA_GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Set both or neither: the server won't start with only one. Once they're set, **Settings → Connected calendars** shows **Connect Google**. It goes to Google's consent screen, and back in Homa the person picks which of their calendars sync. Calendars they can only see (shared with "See all event details" or "See only free/busy") are read-only in Homa.

## Testing and publishing

- **Refresh tokens expire after 7 days while the app is in Testing.** Google does this for External apps in Testing. A week after connecting, the connection shows an error asking to connect Google again: remove it and connect again. This is fine for trying Homa out.
- To stop that, go to **Audience** and click **Publish app**. Because the calendar scope is sensitive, Google asks for verification before people outside your test users can connect without a warning: a privacy policy on your domain, a short video of the consent flow, and a review that can take a few weeks. For a family instance, staying in Testing and reconnecting weekly, or publishing and accepting the "unverified app" warning for a handful of accounts (Google allows 100), are both workable.
- Internal apps (a Google Workspace organization) need no verification, and their tokens don't expire after a week.

## Troubleshooting

- **"redirect_uri_mismatch" on Google's page:** the redirect URI in the client doesn't match `HOMA_URL` + `/api/connections/google/callback` exactly (scheme, host, port and no trailing slash).
- **"Access blocked" or "has not completed the Google verification process":** the account isn't a test user. Add it under **Audience → Test users**.
- **Back in Homa with "access wasn't granted" or "allow Homa to see and edit your calendars":** the person declined, or unticked the calendar permission on the consent screen. Connect again and leave it ticked.
- **"Google no longer accepts Homa's access":** the refresh token expired (Testing, after 7 days) or was revoked at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Remove the connection and connect again.
