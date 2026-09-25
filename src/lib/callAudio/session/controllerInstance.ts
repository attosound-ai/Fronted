/**
 * React Native wiring of the CallPlaybackController: the native bridge, the
 * offline preparer, PostHog + Sentry telemetry, the native event stream and
 * the callStore mirror. One instance for the app's life, created lazily so
 * importing this module never touches NativeModules at load.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { analytics } from '@/lib/analytics';
import { useCallStore } from '@/stores/callStore';
import { CallPlaybackController } from './CallPlaybackController';
import { mixerService } from '@/lib/callAudio/mixerService';
import { nativePreparer } from './preparer';
import type {
  NativeSessionModule,
  NativeSessionStatus,
  PlaybackSnapshot,
  PlaybackTelemetry,
} from './types';

const NATIVE_MODULE_NAME = 'AttoAudioInjection';
const EVENT_NAME = 'AttoCallPlaybackEvent';

function nativeSession(): NativeSessionModule | null {
  if (Platform.OS !== 'ios') return null;
  const mod = (NativeModules as Record<string, unknown>)[NATIVE_MODULE_NAME] as
    | (Partial<NativeSessionModule> & Record<string, unknown>)
    | undefined;
  if (!mod || typeof mod.sessionLoad !== 'function') return null;
  return mod as NativeSessionModule;
}

const telemetry: PlaybackTelemetry = {
  capture(event, props) {
    analytics.capture(event, props);
  },
  // Breadcrumb BEFORE the native call (mixerService pattern): if the bridge
  // crashes, the last action is already on the Sentry scope.
  breadcrumb(message, data) {
    Sentry.addBreadcrumb({ category: 'call_playback', level: 'info', message, data });
  },
  context(snapshot: PlaybackSnapshot) {
    Sentry.setContext('callPlayback', {
      engineMode: snapshot.engineMode,
      owner: snapshot.ownerId,
      surface: snapshot.surface,
      kind: snapshot.source?.kind ?? null,
      status: snapshot.status,
      positionMs: Math.round(snapshot.positionMs),
      durationMs: Math.round(snapshot.durationMs),
      transmit: snapshot.transmit,
      generation: snapshot.generation,
      reason: snapshot.reason,
    });
  },
  warn(message, data) {
    Sentry.captureMessage(message, { level: 'warning', extra: data });
  },
};

let instance: CallPlaybackController | null = null;

export function getCallPlaybackController(): CallPlaybackController {
  if (instance) return instance;
  const native = nativeSession();
  instance = new CallPlaybackController({
    native,
    preparer: nativePreparer,
    telemetry,
    // The injector's own count of frames handed to the call. It is the only
    // number that says the far party received anything.
    framesToCall: async () => {
      const diag = await mixerService.getMixDiagnostics();
      const frames = diag?.injectFramesToCapture;
      return typeof frames === 'number' ? frames : null;
    },
  });
  instance.subscribe((snapshot) => {
    useCallStore.getState().setPlayback(snapshot);
  });
  if (native) {
    try {
      const emitter = new NativeEventEmitter(NativeModules[NATIVE_MODULE_NAME] as never);
      emitter.addListener(
        EVENT_NAME,
        (e: NativeSessionStatus & { reason?: string | null }) => {
          instance?.handleNativeEvent(e);
        }
      );
    } catch {
      // Ticks are a nicety; transport results still update the snapshot.
    }
  }
  return instance;
}
