import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { User } from '@/types';

export function useUserSearch(query: string) {
  return useQuery<User[]>({
    queryKey: QUERY_KEYS.USERS.SEARCH(query),
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await apiClient.get(API_ENDPOINTS.USERS.SEARCH, { params: { q: query } });
      return res.data?.data ?? res.data ?? [];
    },
    enabled: query.trim().length > 0,
    staleTime: 1000 * 30,
  });
}
