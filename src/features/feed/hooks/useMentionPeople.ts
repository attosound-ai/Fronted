import { useQueries, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Who each @name in a caption really is: their id and role, or null when no
 * account has that exact username.
 *
 * The caption paints a creator's name gold and anyone else's cream, and a name
 * that matches nobody stays plain text (David, Oct 27 2026). Before this every
 * @word looked like a tag, so a typo (@youngraybeatz for @youngraybeats) looked
 * like a link that was broken.
 *
 * One request per name for the whole session, shared by every caption and by
 * the tap, through the query cache.
 */
export interface MentionPerson {
  id: string;
  role: string;
}

const STALE_MS = 30 * 60_000;

export function mentionPersonKey(username: string) {
  return ['mention-person', username.toLowerCase()] as const;
}

async function lookUp(username: string): Promise<MentionPerson | null> {
  const res = await apiClient.get(API_ENDPOINTS.USERS.SEARCH, {
    params: { q: username },
  });
  const list = (res.data?.data ?? []) as {
    id: string | number;
    username: string;
    role?: string;
  }[];
  const exact = list.find((u) => u.username?.toLowerCase() === username.toLowerCase());
  return exact ? { id: String(exact.id), role: exact.role ?? '' } : null;
}

/** The same lookup, for a tap that lands before the caption's own one returned. */
export function fetchMentionPerson(
  queryClient: QueryClient,
  username: string
): Promise<MentionPerson | null> {
  return queryClient.fetchQuery({
    queryKey: mentionPersonKey(username),
    queryFn: () => lookUp(username),
    staleTime: STALE_MS,
  });
}

/**
 * username (lowercased) to the person, null when nobody has that name, and
 * missing while the answer is on its way or the lookup failed (a failed lookup
 * never claims the account does not exist).
 */
export function useMentionPeople(
  usernames: string[]
): Record<string, MentionPerson | null> {
  const results = useQueries({
    queries: usernames.map((name) => ({
      queryKey: mentionPersonKey(name),
      queryFn: () => lookUp(name),
      staleTime: STALE_MS,
      gcTime: 2 * STALE_MS,
      retry: 1,
    })),
  });
  const out: Record<string, MentionPerson | null> = {};
  usernames.forEach((name, i) => {
    const r = results[i];
    if (r?.isSuccess) out[name.toLowerCase()] = r.data;
  });
  return out;
}
