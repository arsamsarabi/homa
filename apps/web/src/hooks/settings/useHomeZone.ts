import { browserTimeZone } from '@/services/zones';
import { useSettings } from './useSettings';

/** The home zone: the one in settings, else the browser's. */
export function useHomeZone(): string {
  return useSettings().data?.homeTz ?? browserTimeZone();
}
