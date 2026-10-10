import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  Platform,
  Settings,
} from 'react-native';

import { analytics } from '@/lib/analytics';
import { mmkvStorage } from '@/lib/storage/mmkv';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import {
  containsRecovery,
  healCaptures,
  type HealCapture,
  type NativeHealEvent,
} from './engineHealModel';

/**
 * Reports the voice engine's self heal (Oct 10 2026) and carries its two switches.
 *
 * The healing itself is native (AttoAudioEngineDevice, patched Twilio SDK): when a
 * connected call's capture callbacks freeze, the unit disappears or the session
 * leaves PlayAndRecord, it reasserts the session and rebuilds the unit. JS only
 * reports it, re-applies the user's speaker or earpiece choice after a heal (any
 * category write clears the port override), and writes the switches the native
 * side reads from NSUserDefaults:
 *
 *   atto_engine_self_heal_off   PostHog flag `engine_self_heal_off` (kill switch,
 *                               absent = healing on)
 *   atto_fault_injection        PostHog flag `call_audio_fault_injection`, only
 *                               for test accounts: lets injectCallAudioFault break
 *                               a live call on purpose to prove the healing
 */

const MODULE = 'AttoAudioInjection';
const LAST_REPORTED_KEY = 'atto_heal_last_reported_at';
const HEAL_EVENT = 'AttoCallAudioHealEvent';

interface HealNative {
  drainCallAudioHealRing?: () => Promise<NativeHealEvent[]>;
  injectCallAudioFault?: (mode: string) => Promise<string | null>;
}

function native(): HealNative | null {
  if (Platform.OS !== 'ios') return null;
  return ((NativeModules as Record<string, unknown>)[MODULE] as HealNative) ?? null;
}

function lastReportedAt(): number {
  const raw = mmkvStorage.getString(LAST_REPORTED_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

let routeReapplier: (() => void) | null = null;

/** useTwilioVoice registers ensureAudioRoute here (no import cycle). */
export function registerHealRouteReapplier(fn: (() => void) | null): void {
  routeReapplier = fn;
}

function report(captures: HealCapture[]): void {
  if (captures.length === 0) return;
  const call = useCallStore.getState().activeCall;
  for (const c of captures) {
    analytics.capture(c.name, {
      ...c.props,
      call_sid: call?.callSid ?? null,
      call_state: call?.state ?? null,
      app_state: AppState.currentState,
    });
  }
  mmkvStorage.setString(LAST_REPORTED_KEY, String(captures[captures.length - 1].at));
  if (containsRecovery(captures) && call) routeReapplier?.();
}

/** Report whatever the engine kept while JS could not hear it. */
export async function drainEngineHealRing(): Promise<void> {
  try {
    const events = (await native()?.drainCallAudioHealRing?.()) ?? [];
    report(healCaptures(events, lastReportedAt(), 'ring', Date.now()));
  } catch {
    // Telemetry must never break anything.
  }
}

let started = false;

/** Idempotent. Live events, plus a drain now and every time the app comes back. */
export function startEngineHealReporting(): void {
  if (started) return;
  const mod = native();
  if (!mod) return;
  started = true;
  try {
    const emitter = new NativeEventEmitter(mod as never);
    emitter.addListener(HEAL_EVENT, (event: NativeHealEvent) => {
      report(healCaptures([event], lastReportedAt(), 'live', Date.now()));
    });
  } catch {
    // An old binary without the event: the ring still reports.
  }
  void drainEngineHealRing();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void drainEngineHealRing();
  });
}

/** Write the two native switches from PostHog. Unknown flags leave the disk alone. */
export function persistEngineHealFlags(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const off = analytics.isFeatureEnabled('engine_self_heal_off');
    if (off !== undefined) Settings.set({ atto_engine_self_heal_off: off === true });
    const fault = analytics.isFeatureEnabled('call_audio_fault_injection');
    const signedIn = useAuthStore.getState().user != null;
    if (fault !== undefined)
      Settings.set({ atto_fault_injection: signedIn && fault === true });
  } catch {
    // Settings is iOS only; ignore.
  }
}

/**
 * TEST ONLY: break the live call's audio on purpose. Refused natively unless the
 * fault injection switch is on for this phone. Resolves null when applied, or the
 * reason it was refused.
 */
export async function injectCallAudioFault(
  mode: 'playback_movie' | 'stop_unit'
): Promise<string | null> {
  const mod = native();
  if (!mod?.injectCallAudioFault) return 'not_supported';
  const refused = await mod.injectCallAudioFault(mode);
  analytics.capture('call_audio_fault_injected', {
    mode,
    refused: refused ?? null,
    call_sid: useCallStore.getState().activeCall?.callSid ?? null,
  });
  return refused;
}
