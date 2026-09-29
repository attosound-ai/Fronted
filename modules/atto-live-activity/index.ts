import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The Live Activity of a post on its way out (targets/publish-activity).
 * Every call is best effort: a build without it, iOS below 16.2 or Live
 * Activities turned off simply means the in app strip is the only view.
 */
export type ActivityPhase = 'uploading' | 'posting' | 'paused' | 'posted' | 'failed';

interface AttoLiveActivityNative {
  isSupported(): boolean;
  start(
    thumbnailUri: string | null,
    kind: string,
    progress: number,
    phase: ActivityPhase,
    message: string
  ): Promise<string | null>;
  update(
    id: string,
    progress: number,
    phase: ActivityPhase,
    message: string
  ): Promise<void>;
  end(
    id: string,
    phase: ActivityPhase,
    message: string,
    dismissAfterSeconds: number
  ): Promise<void>;
  endAll(): Promise<void>;
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<AttoLiveActivityNative>('AttoLiveActivity')
    : null;

export function liveActivitySupported(): boolean {
  try {
    return native?.isSupported() ?? false;
  } catch {
    return false;
  }
}

export async function startPublishActivity(
  thumbnailUri: string | null,
  kind: string,
  message: string
): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.start(thumbnailUri, kind, 0, 'uploading', message);
  } catch {
    return null;
  }
}

export async function updatePublishActivity(
  id: string,
  progress: number,
  phase: ActivityPhase,
  message: string
): Promise<void> {
  try {
    await native?.update(id, progress, phase, message);
  } catch {
    // Best effort: the strip in the app is the source of truth.
  }
}

export async function endPublishActivity(
  id: string,
  phase: ActivityPhase,
  message: string,
  dismissAfterSeconds: number
): Promise<void> {
  try {
    await native?.end(id, phase, message, dismissAfterSeconds);
  } catch {
    // Best effort.
  }
}

export async function endAllPublishActivities(): Promise<void> {
  try {
    await native?.endAll();
  } catch {
    // Best effort.
  }
}
