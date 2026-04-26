import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { ChatWallpaper, BackendChatWallpaper } from '../types';

function mapWallpaper(w: BackendChatWallpaper): ChatWallpaper {
  return {
    id: w.id,
    name: w.name,
    imageUrl: w.imageUrl,
    thumbnailUrl: w.thumbnailUrl ?? null,
    tintColor: w.tintColor ?? null,
    overlayOpacity: typeof w.overlayOpacity === 'number' ? w.overlayOpacity : null,
    sortOrder: w.sortOrder ?? 0,
    createdAt: w.createdAt ?? null,
  };
}

export const wallpaperService = {
  async list(): Promise<ChatWallpaper[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: BackendChatWallpaper[];
    }>(API_ENDPOINTS.MESSAGES.WALLPAPERS);
    const items = response.data.data ?? [];
    return items.map(mapWallpaper);
  },
};
