# Sign-in: OIDC and passkeys

People can sign in with email and password on every Homa. Optionally add **one** OpenID Connect (OIDC) identity provider from the environment, and everyone can add **passkeys** from Settings → Security once they have an account.

## Passkeys

No environment variables. Relying-party settings come from `HOMA_URL` (host and origin) and the instance name. After signing in, open **Settings → Security**, add a passkey (the browser prompts), and later use **Sign in with a passkey** on the sign-in page when the browser supports WebAuthn.

## OIDC (single sign-on)

Set all three of `HOMA_OIDC_ISSUER`, `HOMA_OIDC_CLIENT_ID` and `HOMA_OIDC_CLIENT_SECRET`, or none. The server will not start with only some of them. Optional `HOMA_OIDC_NAME` is the button label (default `SSO`): the sign-in page shows **Sign in with …** only when OIDC is configured. See [Environment variables](./environment.md).

Register Homa as a confidential OIDC client with your provider. The redirect URI must be exactly:

```text
${HOMA_URL}/api/auth/callback/oidc
```

for example `https://homa.example.com/api/auth/callback/oidc`. Scopes: `openid`, `email`, `profile`. Homa discovers endpoints from `${HOMA_OIDC_ISSUER}/.well-known/openid-configuration`.

A first OIDC sign-in creates an account only when sign-ups are open (or the person has an invite). It links to an existing account with the same email only when the provider reports that email as verified. The admin page shows whether SSO is on, the provider name, and the redirect URI to register (read-only).

### Authentik

1. Create an **Application** and an **OAuth2/OpenID Provider** (confidential client, client secret).
2. Set **Redirect URIs / Origins** to `${HOMA_URL}/api/auth/callback/oidc`.
3. Copy the provider’s **OpenID Configuration Issuer** (often `https://authentik.example.com/application/o/<slug>/`), client ID and client secret into `HOMA_OIDC_*`.
4. Set `HOMA_OIDC_NAME=Authentik` (or whatever you want on the button).

### Keycloak

1. Create a client: **Client authentication** On, **Standard flow** On.
2. **Valid redirect URIs:** `${HOMA_URL}/api/auth/callback/oidc`.
3. Issuer is the realm URL, for example `https://keycloak.example.com/realms/homa` (the discovery document is at `…/.well-known/openid-configuration`).
4. Copy the client ID and secret into `HOMA_OIDC_*`. Set `HOMA_OIDC_NAME=Keycloak` if you like.

### Google (sign-in, not Calendar)

This is separate from [Google Calendar](./google.md) connections (`HOMA_GOOGLE_*`).

1. In Google Cloud, create an OAuth **Web application** client (or reuse a project).
2. Authorized redirect URI: `${HOMA_URL}/api/auth/callback/oidc` (not the Calendar callback).
3. Issuer: `https://accounts.google.com`.
4. Put the client ID and secret in `HOMA_OIDC_CLIENT_ID` / `HOMA_OIDC_CLIENT_SECRET`, and set `HOMA_OIDC_ISSUER=https://accounts.google.com`. `HOMA_OIDC_NAME=Google` is a clear button label.

### Microsoft Entra ID (sign-in, not Outlook calendars)

This is separate from [Microsoft calendar](./microsoft.md) connections (`HOMA_MICROSOFT_*`).

1. App registration → **Web** redirect URI `${HOMA_URL}/api/auth/callback/oidc`.
2. Create a client secret. Issuer for a single tenant: `https://login.microsoftonline.com/<tenant-id>/v2.0` (or the “common” / “organizations” issuer if that matches how you registered the app).
3. Set `HOMA_OIDC_ISSUER`, `HOMA_OIDC_CLIENT_ID`, `HOMA_OIDC_CLIENT_SECRET`, and optionally `HOMA_OIDC_NAME=Microsoft`.

## Troubleshooting

- **redirect_uri_mismatch:** the URI in the provider must match `HOMA_URL` + `/api/auth/callback/oidc` exactly (scheme, host, port, no trailing slash on `HOMA_URL`).
- **Server won’t start:** set all three of issuer, client id and secret, or clear all three (and `HOMA_OIDC_NAME` if you set it alone is fine — only the three secrets are all-or-nothing).
- **Button missing:** `GET /api/instance` should include `oidc: { name, redirectUri }`. If `oidc` is null, the env vars are not loaded; restart after editing `.env`.
