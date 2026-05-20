import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { appIconService } from '../services/appIconService';
import type { AppIcon } from '../types';

/**
 * Fetches the public app-icon catalogue. Admins manage the catalogue from
 * the web admin; the catalogue *advertises* slots — the actual icon bitmaps
 * live in the binary and only ship in a new build.
 */
export function useAppIcons() {
  return useQuery<AppIcon[]>({
    queryKey: QUERY_KEYS.APP_ICONS.CATALOG,
    queryFn: () => appIconService.list(),
    staleTime: 60 * 60 * 1000, // 1 hour — icons change rarely
    gcTime: 24 * 60 * 60 * 1000,
  });
}
