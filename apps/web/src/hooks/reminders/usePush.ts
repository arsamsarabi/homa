// Web push on this browser: whether it can, whether it's on, and turning it on (asks for
// permission, subscribes with the server's VAPID key, saves the subscription) or off.
import { useCallback, useEffect, useState } from 'react';
import { homaClient, unwrap } from '@/api';
import { keyBytes, sameBytes } from '@/services/reminders';

export type PushState = 'unsupported' | 'loading' | 'off' | 'on' | 'denied';

export type PushControl = {
  state: PushState;
  busy: boolean;
  error: string | undefined;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

const supported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

/** How long to wait for a service worker before treating push as unavailable. */
const READY_MS = 8_000;

/**
 * `navigator.serviceWorker.ready` never resolves until a worker is registered. Vite PWA does not
 * register one in dev by default, so awaiting `ready` alone leaves the UI stuck on "loading".
 */
export async function pushRegistration(timeoutMs = READY_MS): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  const ready = navigator.serviceWorker.ready;
  const timedOut = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error('Service worker is not available yet. Try again after the app has fully loaded.'));
    }, timeoutMs);
  });
  return Promise.race([ready, timedOut]);
}

/**
 * @example const push = usePush(); push.state === 'off' && push.enable()
 */
export function usePush(): PushControl {
  const [state, setState] = useState<PushState>(supported() ? 'loading' : 'unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (): Promise<void> => {
    if (!supported()) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    // No registration yet (typical in Vite dev): show Off so the button is usable; enable() still
    // waits briefly for a worker. Do not await `ready` here — it can hang forever.
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing) {
      setState('off');
      return;
    }
    const reg = existing.active ? existing : await navigator.serviceWorker.ready;
    setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => {
      console.error('push state failed', err);
      setState('off');
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const enable = (): Promise<void> =>
    run(async () => {
      if ((await Notification.requestPermission()) !== 'granted') return;
      const { publicKey } = await unwrap(homaClient.GET('/push/key'));
      const reg = await pushRegistration();
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with another key (the server's keys changed) can't be used.
      const key = keyBytes(publicKey);
      const current = sub?.options.applicationServerKey;
      if (sub && current && !sameBytes(new Uint8Array(current), key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const json = sub.toJSON();
      await unwrap(
        homaClient.POST('/push/subscriptions', {
          body: { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } },
        }),
      );
    });

  const disable = (): Promise<void> =>
    run(async () => {
      const reg = await pushRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await unwrap(homaClient.DELETE('/push/subscriptions', { body: { endpoint: sub.endpoint } }));
      await sub.unsubscribe();
    });

  return { state, busy, error, enable, disable };
}
