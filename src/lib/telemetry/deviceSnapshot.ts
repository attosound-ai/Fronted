/**
 * Point-in-time snapshot of everything we want preserved at the moment of
 * (or just before) a crash. Designed to be:
 *   - flat (one level of keys) for trivial PostHog SQL queries
 *   - small (~25 numeric/boolean/short-string fields) so the event payload is light
 *   - safe (every external call is guarded; failures degrade to `null`)
 */

import { Platform, AppState, NativeModules } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';

import { telemetryCounters } from './counters';
import { consumeJsLagStats } from './jsLag';

/**
 * Timestamp captured at module load — used as a proxy for "process started
 * at". Not 100% accurate (module load happens slightly after process start),
 * but precise enough to distinguish "fresh launch" from "warm restore from
 * background", and to bracket runs that span an ambient-telemetry restart.
 */
const PROCESS_BOOT_MS = Date.now();

/**
 * Ground-truth on the iOS CallKit audio-session handoff, read from the native
 * markers written by the patched @twilio/voice-react-native-sdk CallKit
 * callbacks + the live AVAudioSession. Surfaced via the patched
 * RNDeviceInfo.getCallAudioState (see patches/react-native-device-info@*.patch).
 * Lets us PROVE — not infer — whether the audio session activated for a call.
 */
/**
 * One entry of the native AVAudioSessionRouteChangeNotification ring (see
 * `-attoRouteChangeDidOccur:` in patches/react-native-device-info@*.patch).
 * `fromInputPort` / `fromOutputPort` are the ports the route was on BEFORE this
 * change, read out of the notification payload, so entry N's "from" is the state
 * before change N and entry N+1's "from" is the state after it.
 */
export interface NativeRouteChange {
  reason: string;
  reasonValue: number;
  /** Epoch SECONDS, matching the other native ATTO markers. */
  at: number;
  /** This change's position in the monotonic routeChangeCount. */
  count: number;
  fromInputPort: string;
  fromOutputPort: string;
}

export interface NativeCallAudioState {
  didActivateAt: number;
  didDeactivateAt: number;
  answerActionAt: number;
  callConnectAt: number;
  twilioAudioEnabled: boolean;
  liveCategory: string;
  liveMode: string;
  liveOutputPort: string;
  liveInputPort: string;
  liveSampleRate: number;
  liveOtherAudioPlaying: boolean;
  voipPushAt: number;
  voipPushAppState: number;
  /**
   * VoIP report OUTCOME markers, written by AttoVoipBootstrap when it reports (or
   * fails to report) the incoming call to CallKit. This is the funnel that proves
   * whether the cold-launch crash fix works end to end:
   *  - `voipReportPath`   — which branch we took: "warm" (foreground-active,
   *    reported through the RN module) or "cold" (we reported a placeholder
   *    ourselves because the app was background/suspended/terminated).
   *  - `voipReportOutcome`— what happened: cold_reported | warm_pending |
   *    cold_report_error | forced_hard_deadline | gave_up | reported.
   *  - `voipReportAttempt`— re-post attempt index (warm path), -1 on a forced
   *    completion.
   *  - `voipReportAt`     — epoch seconds of the outcome (0 = none yet).
   *
   * OPTIONAL: absent on any build whose native side predates this patch.
   */
  voipReportPath?: string;
  voipReportOutcome?: string;
  voipReportAttempt?: number;
  voipReportAt?: number;
  /**
   * COLD-CALL funnel markers (build 146): the full native chain of a cold-launch
   * call as epoch-seconds stamps (0 = never). invite decoded → answer action →
   * accept → connected → RN module init → handoff posted/adopted → disconnect
   * forwarded. `coldLastCallSid` is the Twilio CallSid, the join key to the
   * call_* events and Sentry breadcrumbs. All optional: absent on builds whose
   * native side predates this patch.
   */
  coldInviteDecodedAt?: number;
  coldAnswerActionAt?: number;
  coldAcceptAt?: number;
  coldConnectedAt?: number;
  coldModuleInitAt?: number;
  coldHandoffPostedAt?: number;
  coldHandoffPostedCount?: number;
  coldHandoffAdoptedAt?: number;
  coldHandoffAdoptedCount?: number;
  coldDisconnectForwardedAt?: number;
  coldLastCallSid?: string;
  /**
   * Per-step answer-handler markers (b147): guard passed/failed, accept begun,
   * CXAction timeout, connect-time self-heal, and the orphan detector (module up
   * + live CallKit call + nothing to hand off). Together they pin the exact line
   * where the b146 answer-handler death occurred and whether the self-heal ran.
   */
  coldAnswerGuardOkAt?: number;
  coldAnswerGuardFailedAt?: number;
  coldAcceptBeginAt?: number;
  coldActionTimeoutAt?: number;
  coldRecoveredAtConnectAt?: number;
  coldOrphanAt?: number;
  /** Engine preinstall at push (b152): was the injection engine put into the
   *  cold call's audio path before the media stack existed? */
  coldEnginePreinstalledAt?: number;
  coldEngineAlreadyInstalledAt?: number;
  coldEnginePreinstallFailedAt?: number;
  /**
   * Route-change attribution, written by the native
   * AVAudioSessionRouteChangeNotification observer added in the same patch.
   * `lastRouteChangeReason` is one of Unknown | NewDeviceAvailable |
   * OldDeviceUnavailable | CategoryChange | Override | WakeFromSleep |
   * NoSuitableRouteForCategory | RouteConfigurationChange, and it is the field
   * that separates "iOS re-routed on its own during the A2DP to HFP handoff"
   * from "the user pulled the AirPods out" from "our own code did it".
   * `lastRouteChangeAt` is epoch SECONDS (0 = no route change observed yet, in
   * which case the reason carries no meaning). `routeChangeCount` is monotonic
   * across the process, so a jump larger than 1 between two samples means route
   * changes happened inside a window we did not poll.
   *
   * OPTIONAL on purpose: these are absent on any build whose native side
   * predates the patch, so every read must tolerate undefined.
   */
  lastRouteChangeReason?: string;
  lastRouteChangeAt?: number;
  routeChangeCount?: number;
  /**
   * The last few route changes, oldest first, straight from the native ring.
   * `lastRouteChangeReason` above is a single last-wins slot, and the
   * invite-to-answer transition fires several route changes inside a few hundred
   * milliseconds (CategoryChange as Twilio takes PlayAndRecord, the A2DP to HFP
   * handoff, our own Override), so at a 750 ms poll the whole burst collapsed into
   * one sample. `routeChangeCount` could then say we had missed four but never
   * which four. This decomposes the burst.
   *
   * OPTIONAL for the same reason as the fields above: absent on any build whose
   * native side predates the patch.
   */
  recentRouteChanges?: NativeRouteChange[];
  /**
   * Session configuration + IO geometry, also new in the same patch and also
   * optional for the same reason. `liveCategoryOptions` is the RAW
   * AVAudioSessionCategoryOptions bitmask (MixWithOthers 1, DuckOthers 2,
   * AllowBluetoothHFP 4, DefaultToSpeaker 8, AllowBluetoothA2DP 32,
   * AllowAirPlay 64) so a write that strips HFP or injects DefaultToSpeaker is
   * a visible fact rather than an inference. `liveOutputVolume` rules out the
   * most embarrassing explanation for silent AirPods.
   */
  liveCategoryOptions?: number;
  liveOutputVolume?: number;
  liveIOBufferDuration?: number;
  liveOutputLatency?: number;
  liveInputLatency?: number;
  liveOutputChannels?: number;
  liveInputChannels?: number;
}

/**
 * The patched react-native-device-info methods (getProcAvailableMemory,
 * getThermalState, getCallAudioState) are NOT exposed on the library's JS
 * `DeviceInfo` wrapper — they exist only on the native RNDeviceInfo module.
 * Under New Architecture this legacy module is still reachable via the interop
 * layer at NativeModules.RNDeviceInfo, so we call them directly. Calling them
 * off the `DeviceInfo` default export silently returns `undefined`, which is
 * why procAvailableMemory / thermalState had been `null` in all telemetry.
 */
const RNDeviceInfoNative = (
  NativeModules as {
    RNDeviceInfo?: {
      getProcAvailableMemory?: () => Promise<number>;
      getThermalState?: () => Promise<string>;
      getCallAudioState?: () => Promise<NativeCallAudioState>;
      setSpeakerOutput?: (enable: boolean) => Promise<{
        ok: boolean;
        requestedSpeaker: boolean;
        liveOutputPort: string;
        error: string;
      }>;
      showAudioRoutePicker?: () => Promise<{ ok: boolean; reason?: string }>;
    };
  }
).RNDeviceInfo;

/**
 * Force the call audio route to speaker/earpiece via the patched native
 * AVAudioSession.overrideOutputAudioPort — the reliable CallKit speaker lever
 * (Twilio's AudioDevice.select() is flaky once CallKit owns the session).
 * Returns the resulting live output port (or null off-iOS / unavailable) so the
 * caller can confirm the route actually changed.
 */
export async function setSpeakerOutput(
  enable: boolean
): Promise<{ ok: boolean; liveOutputPort: string } | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    if (!RNDeviceInfoNative?.setSpeakerOutput) return null;
    const r = await RNDeviceInfoNative.setSpeakerOutput(enable);
    return { ok: r.ok, liveOutputPort: r.liveOutputPort };
  } catch {
    return null;
  }
}

/**
 * Present the SYSTEM audio route picker (AVRoutePickerView) — the popup listing
 * AirPods / iPhone / Speaker. Native-layer presentation, so it cannot be blocked
 * by JS sheets (what killed the old ActionSheet picker in b98). Returns ok:false
 * with a reason when the native trigger could not fire, so the caller can fall
 * back to the direct speaker toggle — a tap must never be a no-op.
 */
export async function showAudioRoutePicker(): Promise<{
  ok: boolean;
  reason?: string;
} | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    if (!RNDeviceInfoNative?.showAudioRoutePicker) return null;
    return await RNDeviceInfoNative.showAudioRoutePicker();
  } catch {
    return null;
  }
}

export async function getCallAudioState(): Promise<NativeCallAudioState | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    if (!RNDeviceInfoNative?.getCallAudioState) return null;
    return await RNDeviceInfoNative.getCallAudioState();
  } catch {
    return null;
  }
}

/**
 * The native route-change reason is only meaningful once a route change has
 * actually been observed; before that the underlying NSUserDefaults integer is
 * 0, which happens to collide with AVAudioSessionRouteChangeReasonUnknown. The
 * timestamp is the disambiguator, so both readers go through here rather than
 * each re-deriving the rule and drifting apart.
 */
export function resolveRouteChangeReason(
  a: NativeCallAudioState | null | undefined
): string | null {
  if (!a) return null;
  const at = a.lastRouteChangeAt ?? 0;
  if (!(at > 0)) return null;
  return a.lastRouteChangeReason || null;
}

/**
 * Milliseconds between the last observed route change and now. Null when no
 * route change has been observed (or on a build without the native observer).
 * This is what turns "the route was BluetoothHFP" into "the route BECAME
 * BluetoothHFP 340 ms ago", which is the difference between a state and an event.
 */
export function routeChangeAgeMs(
  a: NativeCallAudioState | null | undefined
): number | null {
  const at = a?.lastRouteChangeAt ?? 0;
  if (!(at > 0)) return null;
  return Math.max(0, Math.round(Date.now() - at * 1000));
}

/**
 * Render the native route-change ring as an array of short strings, most recent
 * last: `"7 Override @1754… from in:BluetoothHFP out:BluetoothHFP"`.
 *
 * Strings rather than nested objects on purpose. These land on events that a
 * person reads while triaging ONE report, and PostHog flattens nested objects
 * into unqueryable JSON blobs anyway. The decomposable numbers we actually
 * aggregate on (count, reason) already ship as their own top-level properties.
 */
export function formatRouteChangeRing(
  a: NativeCallAudioState | null | undefined
): string[] {
  const ring = a?.recentRouteChanges;
  if (!Array.isArray(ring) || ring.length === 0) return [];
  return ring.map(
    (r) =>
      `${r.count} ${r.reason || 'Unknown'} @${Math.round(r.at)} from in:${r.fromInputPort} out:${r.fromOutputPort}`
  );
}

/**
 * Lightweight, flattened audio-session snapshot for attaching to a single
 * telemetry event (e.g. `call_answered`) — WITHOUT the cost of a full
 * collectDeviceSnapshot(). Proves the live AVAudioSession state at the moment a
 * call is answered: category/mode (PlayAndRecord = has mic; Playback = mic-less
 * feed hijack → dead audio), whether Twilio enabled its audio, and how the
 * push/answer/connect timeline lines up. Returns nulls off-iOS / when the patched
 * native method is unavailable.
 */
export async function captureCallAudioSnapshot(): Promise<Record<string, unknown>> {
  const a = await getCallAudioState();
  return {
    audio_twilio_enabled: a ? a.twilioAudioEnabled : null,
    audio_live_category: a?.liveCategory || null,
    audio_live_mode: a?.liveMode || null,
    audio_live_input_port: a?.liveInputPort || null,
    audio_live_output_port: a?.liveOutputPort || null,
    audio_live_sample_rate: a && a.liveSampleRate > 0 ? a.liveSampleRate : null,
    audio_live_other_playing: a ? a.liveOtherAudioPlaying : null,
    audio_did_activate_at: a && a.didActivateAt > 0 ? a.didActivateAt : null,
    audio_answer_action_at: a && a.answerActionAt > 0 ? a.answerActionAt : null,
    audio_call_connect_at: a && a.callConnectAt > 0 ? a.callConnectAt : null,
    audio_voip_push_at: a && a.voipPushAt > 0 ? a.voipPushAt : null,
    audio_voip_push_app_state:
      a && a.voipPushAt > 0 ? (a.voipPushAppState ?? null) : null,
    // Who moved the route, and how long ago, at the instant this snapshot was
    // taken. On an answer snapshot this is what says whether iOS was still
    // mid-handoff when the call started.
    audio_route_change_reason: resolveRouteChangeReason(a),
    audio_route_change_count: a?.routeChangeCount ?? null,
    audio_time_since_route_change_ms: routeChangeAgeMs(a),
    // The burst, decomposed. `audio_route_change_reason` is last-wins and can only
    // ever name one of the several changes that fire around an answer.
    audio_recent_route_changes: formatRouteChangeRing(a),
    audio_live_category_options: a?.liveCategoryOptions ?? null,
    audio_live_output_volume: a?.liveOutputVolume ?? null,
    audio_live_io_buffer_duration: a?.liveIOBufferDuration ?? null,
    audio_live_output_latency: a?.liveOutputLatency ?? null,
    audio_live_input_latency: a?.liveInputLatency ?? null,
    audio_live_output_channels: a?.liveOutputChannels ?? null,
    audio_live_input_channels: a?.liveInputChannels ?? null,
  };
}

export interface DeviceSnapshot {
  // ── Memory (bytes → MB) ────────────────────────
  memUsedMB: number | null;
  memTotalMB: number | null;
  memMaxAvailableMB: number | null;
  /** % of total physical RAM the process is using right now. */
  memUsedPct: number | null;
  /**
   * Bytes still available to the process before iOS jetsams it (iOS 13+ via
   * `os_proc_available_memory`). null on Android / older iOS. This is the
   * real OOM headroom — `memTotalMB` is the whole device, but iOS gives the
   * process only a fraction.
   */
  procAvailableMemoryMB: number | null;
  /**
   * % of the process's *own* memory budget consumed:
   * used / (used + available) × 100. Approaches 100 right before an OOM
   * kill — the metric to alert on for memory crashes.
   */
  procMemUsedPct: number | null;
  /** iOS thermal pressure: 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown'. null on Android. */
  thermalState: string | null;

  // ── Disk / storage (bytes → MB) ───────────────
  /** Free space on the device's primary volume, in MB. */
  diskFreeMB: number | null;
  /** Total capacity of the primary volume, in MB. */
  diskTotalMB: number | null;
  /** % of disk in use (100 means full). */
  diskUsedPct: number | null;

  // ── Battery / power ───────────────────────────
  /** 0..1 (null if unknown). */
  batteryLevel: number | null;
  /** 'unknown' | 'unplugged' | 'charging' | 'full' */
  batteryState: string | null;
  lowPowerMode: boolean | null;

  // ── Network ───────────────────────────────────
  /** 'wifi' | 'cellular' | 'none' | 'unknown' | 'ethernet' | 'bluetooth' | 'wimax' | 'vpn' | 'other' */
  networkType: string | null;
  networkReachable: boolean | null;
  /** Cellular generation when networkType=='cellular' ('5g' | '4g' | '3g' | '2g'). */
  cellularGeneration: string | null;

  // ── JS runtime health (rolling window since last snapshot) ─
  jsLagLastMs: number;
  jsLagPeakMs: number;
  jsLagAvgMs: number;

  // ── Process lifetime ──────────────────────────
  /** Seconds since module load — proxies "process started at". */
  processUptimeSec: number;

  // ── In-process resource counters ──────────────
  twilioListeners: number;
  twilioListenersPeak: number;
  audioPlayers: number;
  audioPlayersPeak: number;
  socketChannels: number;
  socketChannelsPeak: number;
  activeCalls: number;

  // ── App lifecycle ─────────────────────────────
  /** 'active' | 'background' | 'inactive' | 'unknown' | 'extension' */
  appState: string;

  // ── Call audio path (iOS — ground truth from CallKit / AVAudioSession) ─
  // `audioPlayers` above counts the app's OWN expo-audio players and is blind
  // to Twilio's TVODefaultAudioDevice — these fields read the real CallKit
  // audio-session handoff. `*At` are epoch seconds the native callback last
  // fired (null = never). `audioDidActivateAt` proves whether
  // didActivateAudioSession (the ONLY thing that starts RTP) actually fired.
  audioDidActivateAt: number | null;
  audioDidDeactivateAt: number | null;
  audioAnswerActionAt: number | null;
  /** epoch secs callDidConnect fired (where the build-55 candidate fix re-asserts enabled). */
  audioCallConnectAt: number | null;
  /** twilioAudioDevice.enabled at the last audio callback (RTP on/off). */
  audioTwilioEnabled: boolean | null;
  /** Live AVAudioSession category — should be PlayAndRecord during a call. */
  audioLiveCategory: string | null;
  audioLiveMode: string | null;
  /** Current output route port (e.g. Receiver / Speaker / BluetoothHFP). */
  audioLiveOutputPort: string | null;
  audioLiveInputPort: string | null;
  audioLiveSampleRate: number | null;
  audioLiveOtherPlaying: boolean | null;
  /** epoch secs the native VoIP push last arrived + its app-state raw value. */
  audioVoipPushAt: number | null;
  audioVoipPushAppState: number | null;

  // ── Route-change attribution (iOS, native observer) ──
  // iOS reports WHY the route changed and we used to discard it, which is why
  // every route transition in the AirPods no-audio incident was ambiguous.
  // OldDeviceUnavailable = the user removed the AirPods; NewDeviceAvailable /
  // RouteConfigurationChange = iOS moved it (the A2DP to HFP handoff);
  // Override / CategoryChange = our own code moved it.
  audioRouteChangeReason: string | null;
  /** Monotonic per-process count; a jump > 1 between ticks means unsampled changes. */
  audioRouteChangeCount: number | null;
  audioTimeSinceRouteChangeMs: number | null;

  // ── Session configuration + IO geometry (iOS) ──
  /** RAW AVAudioSessionCategoryOptions bitmask (AllowBluetoothHFP = 4, DefaultToSpeaker = 8). */
  audioLiveCategoryOptions: number | null;
  /** 0..1. Rules out the most embarrassing explanation for silent AirPods. */
  audioLiveOutputVolume: number | null;
  audioLiveIOBufferDuration: number | null;
  audioLiveOutputLatency: number | null;
  audioLiveInputLatency: number | null;
  audioLiveOutputChannels: number | null;
  audioLiveInputChannels: number | null;

  // ── Static identity (cached after first call) ─
  deviceModel: string | null;
  osName: string;
  osVersion: string;
  appVersion: string | null;
  appBuild: string | null;
  isEmulator: boolean | null;
}

let staticCache: Pick<
  DeviceSnapshot,
  'deviceModel' | 'osName' | 'osVersion' | 'appVersion' | 'appBuild' | 'isEmulator'
> | null = null;

async function loadStatic(): Promise<typeof staticCache & object> {
  if (staticCache) return staticCache;
  const [deviceModel, appVersion, appBuild, isEmulator] = await Promise.all([
    DeviceInfo.getModel(),
    DeviceInfo.getVersion(),
    DeviceInfo.getBuildNumber(),
    DeviceInfo.isEmulator().catch(() => false),
  ]);
  staticCache = {
    deviceModel: deviceModel ?? null,
    osName: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: appVersion ?? null,
    appBuild: appBuild ?? null,
    isEmulator,
  };
  return staticCache;
}

function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

export async function getDeviceSnapshot(): Promise<DeviceSnapshot> {
  const [
    memUsed,
    memTotal,
    memMax,
    procAvailable,
    thermalState,
    diskFree,
    diskTotal,
    batteryLevel,
    powerState,
    netInfo,
    staticInfo,
    audioState,
  ] = await Promise.all([
    safe(DeviceInfo.getUsedMemory() as Promise<number>, NaN),
    safe(DeviceInfo.getTotalMemory() as Promise<number>, NaN),
    safe(
      (DeviceInfo.getMaxMemory?.() as Promise<number> | undefined) ??
        Promise.resolve(NaN),
      NaN
    ),
    // Patched into react-native-device-info (see patches/) — iOS-only.
    // Called via the native module directly (NOT the DeviceInfo wrapper, which
    // doesn't expose patched methods). Optional-chained → NaN/null elsewhere.
    safe(RNDeviceInfoNative?.getProcAvailableMemory?.() ?? Promise.resolve(NaN), NaN),
    safe(RNDeviceInfoNative?.getThermalState?.() ?? Promise.resolve(null), null),
    safe(DeviceInfo.getFreeDiskStorage() as Promise<number>, NaN),
    safe(DeviceInfo.getTotalDiskCapacity() as Promise<number>, NaN),
    safe(DeviceInfo.getBatteryLevel() as Promise<number>, NaN),
    safe(
      DeviceInfo.getPowerState() as Promise<{
        batteryLevel?: number;
        batteryState?: string;
        lowPowerMode?: boolean;
      }>,
      {}
    ),
    safe(NetInfo.fetch(), {
      type: 'unknown',
      isInternetReachable: null,
      details: null,
    } as Awaited<ReturnType<typeof NetInfo.fetch>>),
    loadStatic(),
    getCallAudioState(),
  ]);

  // 0 / empty from the native side means "never fired / unknown" → null.
  const a = audioState;
  const aTs = (v: number | undefined): number | null => (v && v > 0 ? v : null);

  const MB = 1024 * 1024;
  const memUsedMB = Number.isFinite(memUsed) ? Math.round(memUsed / MB) : null;
  const memTotalMB = Number.isFinite(memTotal) ? Math.round(memTotal / MB) : null;
  const memMaxAvailableMB = Number.isFinite(memMax) ? Math.round(memMax / MB) : null;
  const memUsedPct =
    memUsedMB != null && memTotalMB != null && memTotalMB > 0
      ? Math.round((memUsedMB / memTotalMB) * 100)
      : null;
  const diskFreeMB = Number.isFinite(diskFree) ? Math.round(diskFree / MB) : null;
  const diskTotalMB = Number.isFinite(diskTotal) ? Math.round(diskTotal / MB) : null;
  const diskUsedPct =
    diskFreeMB != null && diskTotalMB != null && diskTotalMB > 0
      ? Math.round(((diskTotalMB - diskFreeMB) / diskTotalMB) * 100)
      : null;

  const procAvailableMemoryMB = Number.isFinite(procAvailable)
    ? Math.round(procAvailable / MB)
    : null;
  // % of the process's own budget in use: used / (used + available).
  const procMemUsedPct =
    memUsedMB != null &&
    procAvailableMemoryMB != null &&
    memUsedMB + procAvailableMemoryMB > 0
      ? Math.round((memUsedMB / (memUsedMB + procAvailableMemoryMB)) * 100)
      : null;

  const counters = telemetryCounters.snapshot();
  const peaks = telemetryCounters.peakSnapshot();
  // Consume (read + reset) so jsLagPeakMs/avgMs reflect the window since the
  // last snapshot rather than session-since-process-start.
  const lag = consumeJsLagStats();
  const processUptimeSec = Math.max(0, Math.floor((Date.now() - PROCESS_BOOT_MS) / 1000));

  const cellularGeneration =
    netInfo?.type === 'cellular' &&
    netInfo.details &&
    'cellularGeneration' in netInfo.details
      ? ((netInfo.details as { cellularGeneration?: string }).cellularGeneration ?? null)
      : null;

  return {
    memUsedMB,
    memTotalMB,
    memMaxAvailableMB,
    memUsedPct,
    procAvailableMemoryMB,
    procMemUsedPct,
    thermalState: thermalState ?? null,
    diskFreeMB,
    diskTotalMB,
    diskUsedPct,
    batteryLevel: Number.isFinite(batteryLevel) ? batteryLevel : null,
    batteryState: powerState?.batteryState ?? null,
    lowPowerMode: powerState?.lowPowerMode ?? null,
    networkType: netInfo?.type ?? null,
    networkReachable: netInfo?.isInternetReachable ?? null,
    cellularGeneration,
    jsLagLastMs: lag.lastLagMs,
    jsLagPeakMs: lag.peakLagMs,
    jsLagAvgMs: lag.avgLagMs,
    processUptimeSec,
    twilioListeners: counters.twilioListeners,
    twilioListenersPeak: peaks.twilioListeners,
    audioPlayers: counters.audioPlayers,
    audioPlayersPeak: peaks.audioPlayers,
    socketChannels: counters.socketChannels,
    socketChannelsPeak: peaks.socketChannels,
    activeCalls: counters.activeCalls,
    appState: AppState.currentState ?? 'unknown',
    audioDidActivateAt: aTs(a?.didActivateAt),
    audioDidDeactivateAt: aTs(a?.didDeactivateAt),
    audioAnswerActionAt: aTs(a?.answerActionAt),
    audioCallConnectAt: aTs(a?.callConnectAt),
    audioTwilioEnabled: a ? a.twilioAudioEnabled : null,
    audioLiveCategory: a?.liveCategory || null,
    audioLiveMode: a?.liveMode || null,
    audioLiveOutputPort: a?.liveOutputPort || null,
    audioLiveInputPort: a?.liveInputPort || null,
    audioLiveSampleRate: a && a.liveSampleRate > 0 ? a.liveSampleRate : null,
    audioLiveOtherPlaying: a ? a.liveOtherAudioPlaying : null,
    audioVoipPushAt: aTs(a?.voipPushAt),
    audioVoipPushAppState:
      aTs(a?.voipPushAt) != null ? (a?.voipPushAppState ?? null) : null,
    audioRouteChangeReason: resolveRouteChangeReason(a),
    audioRouteChangeCount: a?.routeChangeCount ?? null,
    audioTimeSinceRouteChangeMs: routeChangeAgeMs(a),
    audioLiveCategoryOptions: a?.liveCategoryOptions ?? null,
    audioLiveOutputVolume: a?.liveOutputVolume ?? null,
    audioLiveIOBufferDuration: a?.liveIOBufferDuration ?? null,
    audioLiveOutputLatency: a?.liveOutputLatency ?? null,
    audioLiveInputLatency: a?.liveInputLatency ?? null,
    audioLiveOutputChannels: a?.liveOutputChannels ?? null,
    audioLiveInputChannels: a?.liveInputChannels ?? null,
    ...staticInfo,
  };
}
