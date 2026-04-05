import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { messageService } from '../services/messageService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { ChatMessage, ChatMessagesPage } from '../types';

export function useChat(conversationId: string) {
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.MESSAGES.CHAT(conversationId),
    queryFn: ({ pageParam }) => messageService.getMessages(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: ChatMessagesPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: !!conversationId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    retry: 1,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      messageService.sendMessage({
        conversationId,
        content,
        contentType: 'text',
      }),
    onSuccess: (newMessage: ChatMessage) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.MESSAGE_SENT, {
        conversation_id: conversationId,
        content_type: 'text',
      });
      // Prepend the new message to the first page
      queryClient.setQueryData(
        QUERY_KEYS.MESSAGES.CHAT(conversationId),
        (old: { pages: ChatMessagesPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const [firstPage, ...rest] = old.pages;
          return {
            ...old,
            pages: [
              {
                ...firstPage,
                messages: [newMessage, ...firstPage.messages],
              },
              ...rest,
            ],
          };
        }
      );
      // Invalidate conversation list to update last message preview
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.MESSAGES.CONVERSATIONS(),
      });
    },
    onError: () => {
      // Invalidate to refetch the real state after optimistic failure
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.MESSAGES.CHAT(conversationId),
      });
    },
  });

  const messages: ChatMessage[] = data?.pages.flatMap((page) => page.messages) ?? [];

  return {
    messages,
    isLoading,
    isRefreshing: isRefetching,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: error as Error | null,
    refresh: refetch,
    loadMore: fetchNextPage,
    sendMessage: (content: string) => sendMutation.mutate(content),
    sendMessageAsync: (content: string) => sendMutation.mutateAsync(content),
    isSending: sendMutation.isPending,
    sendError: sendMutation.error as Error | null,
    isSendError: sendMutation.isError,
  };
}
