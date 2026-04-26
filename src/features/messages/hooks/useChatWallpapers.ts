import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { wallpaperService } from '../services/wallpaperService';
import type { ChatWallpaper } from '../types';

/**
 * Fetches the catalogue of active chat wallpapers from content-service.
 *
 * Admins manage wallpapers by inserting / flipping `is_active` on documents
 * in the `chat_wallpapers` MongoDB collection. The client re-fetches on
 * app focus, so new wallpapers show up without a rebuild — that's the
 * whole point of storing them in the DB instead of shipping them as assets.
 */
export function useChatWallpapers() {
  return useQuery<ChatWallpaper[]>({
    queryKey: QUERY_KEYS.MESSAGES.WALLPAPERS,
    queryFn: () => wallpaperService.list(),
    staleTime: 60 * 60 * 1000, // 1 hour — wallpapers change rarely
    gcTime: 24 * 60 * 60 * 1000,
  });
}
