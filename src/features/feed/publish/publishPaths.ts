import * as FileSystem from 'expo-file-system/legacy';

import { fromStoredUri, toStoredUri } from './publishRecovery';
import type { PublishParams } from './publishQueueStore';

/** The app's own folders, by a tag that survives the container moving. */
function roots(): Record<string, string> {
  return {
    'atto-cache://': FileSystem.cacheDirectory ?? '',
    'atto-docs://': FileSystem.documentDirectory ?? '',
  };
}

export const storeUri = (uri: string) => toStoredUri(uri, roots());
export const resolveUri = (uri: string) => fromStoredUri(uri, roots());

export function storeParams(params: PublishParams): PublishParams {
  return {
    ...params,
    media: params.media.map((m) => ({
      ...m,
      uri: storeUri(m.uri),
      thumbnailUri: m.thumbnailUri ? storeUri(m.thumbnailUri) : m.thumbnailUri,
    })),
    coverUri: params.coverUri ? storeUri(params.coverUri) : params.coverUri,
  };
}

export function resolveParams(params: PublishParams): PublishParams {
  return {
    ...params,
    media: params.media.map((m) => ({
      ...m,
      uri: resolveUri(m.uri),
      thumbnailUri: m.thumbnailUri ? resolveUri(m.thumbnailUri) : m.thumbnailUri,
    })),
    coverUri: params.coverUri ? resolveUri(params.coverUri) : params.coverUri,
  };
}

/** Whether every file the post needs is still on the phone. */
export async function mediaStillThere(params: PublishParams): Promise<boolean> {
  for (const m of params.media) {
    if (!m.uri.startsWith('file:')) continue;
    try {
      const info = await FileSystem.getInfoAsync(m.uri);
      if (!info.exists) return false;
    } catch {
      return false;
    }
  }
  return true;
}
