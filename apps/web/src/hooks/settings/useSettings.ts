import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { Settings } from '@/schemas';
import { settingsQuery } from './settings-query';

export const useSettings = (): UseQueryResult<Settings> => useQuery(settingsQuery);
