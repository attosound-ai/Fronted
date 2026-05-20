/**
 * Point-in-time snapshot of everything we want preserved at the moment of
 * (or just before) a crash. Designed to be:
 *   - flat (one level of keys) for trivial PostHog SQL queries
 *   - small (~25 numeric/boolean/short-string fields) so the event payload is light
 *   - safe (every external call is guarded; failures degrade to `null`)
 */

import { Platform, AppState } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';

import { telemetryCounters } from './counters';
import { getJsLagStats } from './jsLag';

export interface DeviceSnapshot {
  // ── Memory (bytes → MB) ────────────────────────
  memUsedMB: number | null;
  memTotalMB: number | null;
  memMaxAvailableMB: number | null;
  /** % of total physical RAM the process is using right now. */
  memUsedPct: number | null;

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

  // ── JS runtime health ─────────────────────────
  jsLagLastMs: number;
  jsLagPeakMs: number;
  jsLagAvgMs: number;

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
  const [memUsed, memTotal, memMax, batteryLevel, powerState, netInfo, staticInfo] =
    await Promise.all([
      safe(DeviceInfo.getUsedMemory() as Promise<number>, NaN),
      safe(DeviceInfo.getTotalMemory() as Promise<number>, NaN),
      safe(
        (DeviceInfo.getMaxMemory?.() as Promise<number> | undefined) ??
          Promise.resolve(NaN),
        NaN
      ),
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
    ]);

  const MB = 1024 * 1024;
  const memUsedMB = Number.isFinite(memUsed) ? Math.round(memUsed / MB) : null;
  const memTotalMB = Number.isFinite(memTotal) ? Math.round(memTotal / MB) : null;
  const memMaxAvailableMB = Number.isFinite(memMax) ? Math.round(memMax / MB) : null;
  const memUsedPct =
    memUsedMB != null && memTotalMB != null && memTotalMB > 0
      ? Math.round((memUsedMB / memTotalMB) * 100)
      : null;

  const counters = telemetryCounters.snapshot();
  const peaks = telemetryCounters.peakSnapshot();
  const lag = getJsLagStats();

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
    batteryLevel: Number.isFinite(batteryLevel) ? batteryLevel : null,
    batteryState: powerState?.batteryState ?? null,
    lowPowerMode: powerState?.lowPowerMode ?? null,
    networkType: netInfo?.type ?? null,
    networkReachable: netInfo?.isInternetReachable ?? null,
    cellularGeneration,
    jsLagLastMs: lag.lastLagMs,
    jsLagPeakMs: lag.peakLagMs,
    jsLagAvgMs: lag.avgLagMs,
    twilioListeners: counters.twilioListeners,
    twilioListenersPeak: peaks.twilioListeners,
    audioPlayers: counters.audioPlayers,
    audioPlayersPeak: peaks.audioPlayers,
    socketChannels: counters.socketChannels,
    socketChannelsPeak: peaks.socketChannels,
    activeCalls: counters.activeCalls,
    appState: AppState.currentState ?? 'unknown',
    ...staticInfo,
  };
}
