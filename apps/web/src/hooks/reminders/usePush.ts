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

/**
 * @example const push = usePush(); push.state === 'off' && push.enable()
 */
export function usePush(): PushControl {
  const [state, setState] = useState<PushState>(supported() ? 'loading' : 'unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (): Promise<void> => {
    if (!supported()) return;
    if (Notification.permission === 'denied') return setState('denied');
    const reg = await navigator.serviceWorker.ready;
    setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
  }, []);
  useEffect(() => {
    refresh().catch((err: unknown) => console.error('push state failed', err));
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
      const reg = await navigator.serviceWorker.ready;
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
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await unwrap(homaClient.DELETE('/push/subscriptions', { body: { endpoint: sub.endpoint } }));
      await sub.unsubscribe();
    });

  return { state, busy, error, enable, disable };
}
