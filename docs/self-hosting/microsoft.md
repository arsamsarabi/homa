# Microsoft (Outlook.com and Microsoft 365)

People on your instance can connect a Microsoft account (a personal Outlook.com, Hotmail or Live account, or a work or school Microsoft 365 account) and sync its calendars both ways. Microsoft only lets an app reach calendars through an app registered in Microsoft Entra ID, so each self-hosted instance registers its own. It takes about ten minutes and costs nothing, but the account that registers the app must belong to a Microsoft Entra directory (a tenant).

You need:

- `HOMA_URL` set to the address people use to reach Homa, such as `https://homa.example.com`. Microsoft sends people back to it, so it must match exactly. Microsoft accepts `http` only for `localhost`.
- `HOMA_ENCRYPTION_KEY` set (see [Environment variables](./environment.md)). Microsoft's tokens are stored encrypted with it.

## 1. Register the app

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) (or the [Azure portal](https://portal.azure.com/), where it's under **Microsoft Entra ID**) with the account that will own the app.

   A personal Microsoft account (Outlook.com, Hotmail, Live) on its own has no directory, and signing in fails with "Selected user account does not exist in tenant 'Microsoft Services'". To get one:

   - **Free Azure account:** create one at [azure.microsoft.com/free](https://azure.microsoft.com/free) with the same personal account. Microsoft asks for a card to verify your identity, but registering an app is free. This creates a "Default Directory" that your account owns. Then sign in to the Azure portal and continue.
   - **Work or school account:** use one that's allowed to register apps in its organization's directory.

   Either way, the app you register can still be used by personal accounts, because of the supported account types chosen in step 4.
2. Go to **Entra ID → App registrations** and click **New registration**.
3. **Name:** one people will recognize on the consent screen, such as your instance's name.
4. **Supported account types:** choose **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**. Newer portals word it **Any Entra ID Tenant + Personal Microsoft accounts**. Homa signs in through the `common` endpoint, so any other choice turns away either personal or work accounts.
5. **Redirect URI:** choose the **Web** platform and enter your `HOMA_URL` followed by `/api/connections/microsoft/callback`, for example `https://homa.example.com/api/connections/microsoft/callback`. (Not **Single-page application**: Homa's server redeems the code with a secret.)
6. Click **Register**. On the app's **Overview**, copy the **Application (client) ID**.

To add or change a redirect URI later (a second address, or `http://localhost:5180/api/connections/microsoft/callback` for local development), go to **Authentication → Add a platform → Web**, or **Add URI** under the Web platform you already have.

## 2. Create a client secret

1. Go to **Certificates & secrets → Client secrets → New client secret**.
2. Give it a description ("Homa") and choose when it expires. Microsoft allows at most 24 months and recommends less than 12.
3. Click **Add** and copy the secret's **Value** right away (not the **Secret ID**). It's shown only once; if you leave the page without it, delete it and make another.

**Put the expiry date in your calendar.** When the secret expires, every Microsoft connection on the instance fails with "Microsoft refused the request (invalid_client)". Before then, create a new secret, put its value in `HOMA_MICROSOFT_CLIENT_SECRET`, restart Homa, and delete the old one. People don't need to connect again.

## 3. Add the API permissions

1. Go to **API permissions**. A new app already has **Microsoft Graph → User.Read**.
2. Click **Add a permission → Microsoft Graph → Delegated permissions**, search for and tick **Calendars.ReadWrite**, then click **Add permissions**.
3. Under **OpenId permissions** in the same list, tick **offline_access**, **openid** and **email** too, so the list shows: `Calendars.ReadWrite`, `email`, `offline_access`, `openid` and `User.Read`, all **Delegated**.

All five are delegated permissions that a person can grant for their own account: no admin consent is needed for personal accounts. Homa asks for them each time someone connects anyway; listing them here shows them on the consent screen as expected and lets a work tenant's admin grant consent for everyone (**Grant admin consent for …**, for your own tenant only).

## 4. Give them to Homa

Add both to `deploy/docker/.env` and restart:

```sh
HOMA_MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000
HOMA_MICROSOFT_CLIENT_SECRET=abc8Q~...
```

Set both or neither: the server won't start with only one. Once they're set, **Settings → Connected calendars** shows **Connect Outlook**. It goes to Microsoft's sign-in, where the person picks an account and allows access, and back in Homa they pick which of their calendars sync. Calendars they can only read (a shared calendar without edit rights, Birthdays, holiday calendars) are read-only in Homa.

## What syncs, and limits

- Events, their title, notes (as plain text), location, times and time zone, and repeating events with their changed and cancelled occurrences. Guests, reminders, Teams links and categories set in Outlook are left alone when Homa edits an event.
- Outlook can repeat daily, weekly (on chosen days), monthly or yearly on a date, or on the "first/second/third/fourth/last" weekday. Homa can't push rules Outlook doesn't have, such as "every hour", "the 5th Monday", "the last day of the month" or extra single dates added to a series: the change isn't saved to Outlook and the connection shows a notice saying why.
- Each sync lists the whole calendar and downloads only the events whose version changed, because Microsoft Graph offers change tracking per calendar only in its beta API. Very large calendars (tens of thousands of events) make each sync slower.
- Microsoft limits how fast an app can call it. When it says to slow down, Homa waits as long as Microsoft asks before pushing that change again, and the next scheduled sync pulls again.

## Troubleshooting

- **"Selected user account does not exist in tenant 'Microsoft Services'" when opening the admin center or App registrations:** the account has no Entra directory. Create a free Azure account with it, or use a work or school account (see step 1).
- **"The redirect URI … does not match" (AADSTS50011) on Microsoft's page:** the Web redirect URI doesn't match `HOMA_URL` + `/api/connections/microsoft/callback` exactly (scheme, host, port, no trailing slash), or it was added under Single-page application instead of Web.
- **"… is not configured as a multi-tenant application" or personal accounts refused (AADSTS50020, AADSTS700016):** the supported account types aren't the multitenant-plus-personal option. Change it under **Authentication** (or the app's **Manifest**, `signInAudience: AzureADandPersonalMicrosoftAccount`).
- **"Need admin approval" for a work account:** that organization doesn't let people consent to apps themselves. Its admin has to approve the app (they'll see its name and the permissions above).
- **Back in Homa with "access wasn't granted":** the person declined on the consent screen. Connect again and accept.
- **"Microsoft refused the request (invalid_client)":** the client secret expired or is wrong. See step 2.
- **"Microsoft no longer accepts Homa's access":** the person revoked access (at [account.live.com/consent/Manage](https://account.live.com/consent/Manage) or [myapps.microsoft.com](https://myapps.microsoft.com/)), changed their password on a work account, or didn't sync for 90 days. Remove the connection and connect again.
