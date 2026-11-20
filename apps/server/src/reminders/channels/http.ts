// POSTs for ntfy, Gotify and webhooks: public https addresses only (unless private networks are
// allowed), a timeout, no redirects, and the answer sorted into "retry" or "give up".
import { assertPublicHost, SyncError } from '@homa/sync';
import { DeliveryError } from '@/reminders/channels';

const TIMEOUT_MS = 10_000;

/** Throws DeliveryError when the POST fails; retriable for network errors, timeouts, 429 and 5xx. */
export async function postJson(
  url: URL,
  body: string,
  headers: Record<string, string>,
  allowPrivate: boolean,
): Promise<void> {
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:'))
    throw new DeliveryError(`${url.host} is not an https address`, false);
  try {
    // shortcut: the address is checked, then fetch resolves it again (DNS rebinding); pin the
    // resolved address if channels ever reach untrusted users at scale.
    await assertPublicHost(url, allowPrivate);
  } catch (err) {
    if (err instanceof SyncError)
      throw new DeliveryError(`${url.host} is on a private network or could not be found`, false);
    throw err;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Homa', ...headers },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const why = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
    throw new DeliveryError(`${url.host} ${why}`, true);
  }
  await res.body?.cancel();
  if (res.ok) return;
  throw new DeliveryError(`${url.host} answered ${res.status}`, res.status === 429 || res.status >= 500);
}
