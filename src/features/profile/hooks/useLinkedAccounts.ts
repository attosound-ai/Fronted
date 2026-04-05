import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';

interface LinkedAccount {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  role: string;
}

export function useLinkedAccounts() {
  const { data, isLoading, refetch } = useQuery<LinkedAccount[]>({
    queryKey: ['users', 'linked-accounts'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.USERS.LINKED_ACCOUNTS);
      return res.data?.data ?? res.data ?? [];
    },
    staleTime: 0, // Always refetch — critical for delete flow
    retry: 2,
  });

  const accounts = Array.isArray(data) ? data : [];
  return {
    linkedAccounts: accounts,
    isLoading,
    hasLinkedAccounts: accounts.length > 0,
    refetch,
  };
}
