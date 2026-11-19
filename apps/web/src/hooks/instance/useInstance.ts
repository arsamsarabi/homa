import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { PublicInstance } from '@/schemas';
import { instanceQuery } from './instance-query';

export const useInstance = (): UseQueryResult<PublicInstance> => useQuery(instanceQuery);
