import { useEffect, useRef } from 'react';
import type { Notification } from '@/schemas';
import { arrivals } from '@/services/reminders';

/**
 * Calls `onArrive` for each notification that fires while the app is open: unread ones the last
 * poll didn't have. The first list only sets the baseline, so a page load doesn't replay old ones.
 * @example useNotificationArrivals(list.data?.items, (n) => notifyInfo(n.title))
 */
export function useNotificationArrivals(
  items: readonly Notification[] | undefined,
  onArrive: (n: Notification) => void,
): void {
  const seen = useRef<Set<string> | null>(null);
  const latest = useRef(onArrive);
  latest.current = onArrive;
  useEffect(() => {
    if (!items) return;
    const known = seen.current;
    seen.current = new Set(items.map((n) => n.id));
    if (known) for (const n of arrivals(items, known)) latest.current(n);
  }, [items]);
}
