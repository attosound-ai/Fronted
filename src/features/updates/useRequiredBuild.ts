/**
 * El build mínimo que el admin exige, y lo que dirá la pantalla de bloqueo.
 *
 * Vive en su propio endpoint y no dentro de la respuesta del logo, aunque esa
 * ya viaja en cada arranque: la del logo devuelve `data: null` cuando no hay
 * logo configurado, y una puerta que bloquea la app entera no puede depender
 * de que exista un ajuste que no tiene nada que ver.
 *
 * Se guarda en MMKV para que un arranque sin red siga respetando el bloqueo
 * que ya conocía, y por el mismo motivo NUNCA bloquea por falta de dato: si no
 * hay respuesta ni copia guardada, la app abre. Un fallo de red no puede dejar
 * a nadie fuera de su propia aplicación.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';

import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { mmkvStorage } from '@/lib/storage/mmkv';
import { debeActualizar } from './releaseGate';

export { debeActualizar };

const CACHE_KEY = 'required_build_v1';

export interface UpdateCopy {
  title?: string | null;
  message?: string | null;
  button?: string | null;
  url?: string | null;
}

export interface ReleaseGate {
  minBuild: number;
  copy: UpdateCopy | null;
}

/** El build que corre ahora mismo. 0 cuando el sistema no lo sabe decir. */
export const APP_BUILD = Number(Application.nativeBuildVersion ?? '') || 0;

function leerCache(): ReleaseGate {
  try {
    const raw = mmkvStorage.getString(CACHE_KEY);
    if (!raw) return { minBuild: 0, copy: null };
    const v = JSON.parse(raw) as ReleaseGate;
    return { minBuild: Number(v?.minBuild) || 0, copy: v?.copy ?? null };
  } catch {
    return { minBuild: 0, copy: null };
  }
}

function guardarCache(v: ReleaseGate): void {
  try {
    mmkvStorage.setString(CACHE_KEY, JSON.stringify(v));
  } catch {
    // best effort: perderlo solo cuesta un arranque sin bloqueo conocido
  }
}

/** Lo último que se supo, para pintar antes de que responda la red. */
export function getCachedReleaseGate(): ReleaseGate {
  return leerCache();
}

export function useReleaseGate(): { bloqueado: boolean; copy: UpdateCopy | null } {
  const { data } = useQuery<ReleaseGate>({
    queryKey: ['app-release'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.APP_LOGO.RELEASE);
      const d = res.data?.data ?? {};
      return { minBuild: Number(d.minBuild) || 0, copy: d.copy ?? null };
    },
    initialData: leerCache,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (data) guardarCache(data);
  }, [data]);

  return {
    bloqueado: debeActualizar(APP_BUILD, data?.minBuild ?? 0),
    copy: data?.copy ?? null,
  };
}
