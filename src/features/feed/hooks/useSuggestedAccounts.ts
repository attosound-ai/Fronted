import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

export function useSuggestedAccounts() {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'suggested', currentUserId],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.USERS.DISCOVER, {
        params: { limit: 20 },
      });
      return (res.data?.data ?? res.data ?? []) as User[];
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5,
  });

  return { users: data ?? [], isLoading };
}
