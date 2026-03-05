import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { User } from '@/types';

export function useUserSearch(query: string) {
  const trimmed = query.trim();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.USERS.SEARCH(trimmed),
    queryFn: async () => {
      const response = await apiClient.get(API_ENDPOINTS.USERS.SEARCH, {
        params: { q: trimmed },
      });
      return response.data.data as User[];
    },
    enabled: trimmed.length >= 2,
    staleTime: 1000 * 60,
  });

  return {
    results: data ?? [],
    isLoading: trimmed.length >= 2 && isLoading,
  };
}
