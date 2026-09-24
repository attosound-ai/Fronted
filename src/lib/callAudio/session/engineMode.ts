/**
 * The per call ENGINE MODE decision. Evaluated by CallPlaybackHost once when a
 * call connects (and again only on an account switch), then latched: PostHog
 * flags arrive late on a cold CallKit launch, and a mode flip mid call would
 * put an expo player and an engine session on the air at the same time.
 *
 * Every gate is returned so the `call_playback_engine_mode` row can answer
 * "why not" without a second look at the device.
 */

import { NativeModules, Platform } from 'react-native';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import {
  isInjectionDeviceInstalled,
  nativeInjectionDeviceInstalled,
} from '@/hooks/useTwilioVoice';
import { AUDIO_INJECTION_FLAG } from '@/lib/callAudio/createAudioInjector';
import { isPreparerAvailable } from './preparer';
import type { EngineMode } from './types';

/** Master switch of the new call playback path (creator cohort). */
export const CALL_PLAYBACK_FLAG = 'call_playback_v2';
/** Sub switches: the timeline editor and the video surfaces. */
export const CALL_PLAYBACK_TIMELINE_FLAG = 'call_playback_v2_timeline';
export const CALL_PLAYBACK_VIDEO_FLAG = 'call_playback_v2_video';

export interface EngineModeDecision {
  mode: EngineMode;
  gates: Record<string, boolean | string | null>;
}

function nativeHasSession(): boolean {
  if (Platform.OS !== 'ios') return false;
  const mod = (NativeModules as Record<string, { sessionLoad?: unknown } | undefined>)[
    'AttoAudioInjection'
  ];
  return typeof mod?.sessionLoad === 'function';
}

export function resolveEngineMode(): EngineModeDecision {
  const flagOn = analytics.isFeatureEnabled(CALL_PLAYBACK_FLAG) === true;
  const injectionOn = analytics.isFeatureEnabled(AUDIO_INJECTION_FLAG) === true;
  const timelineOn = analytics.isFeatureEnabled(CALL_PLAYBACK_TIMELINE_FLAG) === true;
  const videoOn = analytics.isFeatureEnabled(CALL_PLAYBACK_VIDEO_FLAG) === true;
  const role = useAuthStore.getState().user?.role ?? null;
  const isCreator = role === 'creator';
  const deviceInstalled = isInjectionDeviceInstalled();
  const nativeDeviceInstalled = nativeInjectionDeviceInstalled();
  const nativeOk = nativeHasSession();
  const preparerOk = isPreparerAvailable();
  const engine =
    Platform.OS === 'ios' &&
    flagOn &&
    injectionOn &&
    isCreator &&
    deviceInstalled &&
    nativeOk &&
    preparerOk;
  return {
    mode: {
      engine,
      timeline: engine && timelineOn,
      video: engine && videoOn,
    },
    gates: {
      platform: Platform.OS,
      flag_call_playback_v2: flagOn,
      flag_audio_injection: injectionOn,
      flag_timeline: timelineOn,
      flag_video: videoOn,
      role,
      device_installed: deviceInstalled,
      native_device_installed: nativeDeviceInstalled,
      native_session_api: nativeOk,
      preparer_available: preparerOk,
    },
  };
}
