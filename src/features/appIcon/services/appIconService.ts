import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { AppIcon, AppIconSlot, BackendAppIcon } from '../types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string | null;
}

function mapAppIcon(raw: BackendAppIcon): AppIcon {
  return {
    id: raw.id,
    slotName: raw.slotName,
    name: raw.name,
    previewUrl: raw.previewUrl,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    createdAt: raw.createdAt ?? null,
  };
}

export const appIconService = {
  /**
   * Fetch the public catalogue of available app icons. Mirrors the wallpaper
   * catalogue: cached client-side via React Query, refreshed on app focus.
   */
  async list(): Promise<AppIcon[]> {
    // Explicit 8 s timeout — the catalog endpoint occasionally times out
    // during Railway cold-starts. React Query's `retry: 1` will reissue
    // once on failure (~16 s worst case), still better than hanging the
    // bottom sheet indefinitely on a stale "Loading icons…" state.
    const response = await apiClient.get<ApiEnvelope<BackendAppIcon[]>>(
      API_ENDPOINTS.APP_ICONS.CATALOG,
      { timeout: 8000 }
    );
    const items = response.data.data ?? [];
    return items.map(mapAppIcon);
  },

  /**
   * Return the user's last-persisted icon selection from the server. We
   * still use a local store for instant UI but the server is the source of
   * truth across devices.
   */
  async getMine(): Promise<AppIconSlot> {
    const response = await apiClient.get<ApiEnvelope<{ slotName: AppIconSlot }>>(
      API_ENDPOINTS.APP_ICONS.MY
    );
    return response.data.data?.slotName ?? null;
  },

  /**
   * Persist the user's selection server-side. `null` means "revert to the
   * primary icon" — the backend stores the absence of a row for that user.
   */
  async setMine(slotName: AppIconSlot): Promise<void> {
    await apiClient.put(API_ENDPOINTS.APP_ICONS.MY, { slotName });
  },
};
