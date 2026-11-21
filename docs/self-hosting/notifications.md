# Notifications

Reminders always show in the bell in Homa's header. People can also get them as browser push notifications and on the channels they add under Settings → Notification channels: email, [ntfy](https://ntfy.sh), [Gotify](https://gotify.net) and webhooks. The worker sends them (`HOMA_ROLE=worker` or `all`), at most a minute after they're due.

## Web push

Works without setup on HTTPS (and on `http://localhost`). The keys are generated on first start and kept in the database; set `HOMA_VAPID_PUBLIC_KEY` and `HOMA_VAPID_PRIVATE_KEY` to use your own, and `HOMA_VAPID_SUBJECT` to a `mailto:` or `https:` address for Safari and iOS. See [Environment variables](./environment.md).

## Email

Set both:

```sh
HOMA_SMTP_URL=smtp://user:password@smtp.example.com:587   # STARTTLS; smtps://…:465 for TLS
HOMA_MAIL_FROM="Homa <homa@example.com>"
```

URL-encode special characters in the password (`@` is `%40`). Without these settings the email option is hidden. Email channels only send to the account's own address. If the mail server refuses a message for good (a 5xx reply), the delivery isn't retried; a busy server (4xx) or a dropped connection is retried with backoff for about two hours.

## ntfy and Gotify

People enter the server address, the topic (ntfy) and a token. Tokens, topics and webhook addresses are stored encrypted with `HOMA_ENCRYPTION_KEY`, so it must be set before anyone adds one of these channels.

Addresses must be `https` and resolve to public IP addresses. For an ntfy or Gotify server on your own network, set `HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS=true`. That also allows plain `http` and lets every user's channels reach your private network, so only turn it on when you trust everyone with an account.

## Webhooks

Homa POSTs JSON to the address:

```json
{ "type": "reminder", "id": "…", "title": "Dentist", "startAt": "2026-11-20T15:00:00.000Z", "allDay": false,
  "kind": "event", "fireAt": "2026-11-20T14:50:00.000Z", "url": "https://homa.example.com" }
```

`type` is `test` for "Send test". Each request has `X-Homa-Timestamp` (Unix seconds) and `X-Homa-Signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<body>` with the channel's secret (shown once, when the channel is added). Check it, and reject timestamps more than 5 minutes old:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, timestamp, body, signature) {
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return fresh && expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

Answer with any 2xx. A 429, a 5xx, a timeout (10 seconds) or a network error is retried after 1, 2, 4 … minutes, 8 tries in all; other answers and redirects aren't retried. After 3 failures in a row, Settings shows the channel as failing, with the last error.
