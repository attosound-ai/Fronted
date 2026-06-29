import { Platform } from 'react-native';
import { analytics } from '@/lib/analytics';
import { type AudioInjector } from './AudioInjector';
import { NullAudioInjector } from './NullAudioInjector';
import { NativeAudioInjector } from './NativeAudioInjector';

/**
 * createAudioInjector — the ONLY engine-aware module. It selects the concrete
 * {@link AudioInjector} based on the platform + feature flag, so flipping the
 * engine (native ↔ server) or shipping the feature dark is a one-line change
 * here and NO caller is touched (Open-Closed / Dependency Inversion).
 *
 * Default OFF: with the flag disabled (its Phase-0 state) this returns the inert
 * NullAudioInjector, so the UI never mounts and no native code runs — base calls
 * are byte-for-byte unchanged.
 */

/** PostHog feature-flag key (remote kill-switch). Absent ⇒ undefined ⇒ OFF. */
export const AUDIO_INJECTION_FLAG = 'audio_injection_enabled';

export function isInjectionFeatureEnabled(): boolean {
  return analytics.isFeatureEnabled(AUDIO_INJECTION_FLAG) === true;
}

// Cache one instance per concrete engine so subscribers stay attached across
// getAudioInjector() calls.
let cachedNative: NativeAudioInjector | null = null;
let cachedNull: NullAudioInjector | null = null;

function nullInjector(): AudioInjector {
  if (!cachedNull) cachedNull = new NullAudioInjector();
  return cachedNull;
}

/**
 * The active injector. iOS + flag ON + native engine present → NativeAudioInjector;
 * otherwise the inert NullAudioInjector. (ServerAudioInjector slots in here when
 * the deferred cross-platform path is built — a single added branch.)
 */
export function getAudioInjector(): AudioInjector {
  if (Platform.OS === 'ios' && isInjectionFeatureEnabled()) {
    if (!cachedNative) cachedNative = new NativeAudioInjector();
    if (cachedNative.isSupported()) return cachedNative;
  }
  return nullInjector();
}
