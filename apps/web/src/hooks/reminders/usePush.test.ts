import { describe, expect, test } from 'bun:test';
import { pushRegistration } from './usePush';

describe('pushRegistration', () => {
  test('resolves an existing active registration without waiting on ready', async () => {
    const active = {} as ServiceWorker;
    const existing = { active } as ServiceWorkerRegistration;
    const ready = new Promise<ServiceWorkerRegistration>(() => {
      /* never resolves — would hang the old refresh path */
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => existing,
        ready,
      },
    });
    await expect(pushRegistration(50)).resolves.toBe(existing);
  });

  test('times out when no service worker is registered', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => undefined,
        ready: new Promise<ServiceWorkerRegistration>(() => {
          /* hang */
        }),
      },
    });
    await expect(pushRegistration(30)).rejects.toThrow(/not available/i);
  });
});
