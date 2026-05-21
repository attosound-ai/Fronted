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
import { consumeJsLagStats } from './jsLag';

/**
 * Timestamp captured at module load — used as a proxy for "process started
 * at". Not 100% accurate (module load happens slightly after process start),
 * but precise enough to distinguish "fresh launch" from "warm restore from
 * background", and to bracket runs that span an ambient-telemetry restart.
 */
const PROCESS_BOOT_MS = Date.now();

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
  ] = await Promise.all([
    safe(DeviceInfo.getUsedMemory() as Promise<number>, NaN),
    safe(DeviceInfo.getTotalMemory() as Promise<number>, NaN),
    safe(
      (DeviceInfo.getMaxMemory?.() as Promise<number> | undefined) ??
        Promise.resolve(NaN),
      NaN
    ),
    // Patched into react-native-device-info (see patches/) — iOS-only.
    // Optional-chained so Android / older builds degrade to NaN → null.
    safe(
      (
        DeviceInfo as unknown as {
          getProcAvailableMemory?: () => Promise<number>;
        }
      ).getProcAvailableMemory?.() ?? Promise.resolve(NaN),
      NaN
    ),
    safe(
      (
        DeviceInfo as unknown as { getThermalState?: () => Promise<string> }
      ).getThermalState?.() ?? Promise.resolve(null),
      null
    ),
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
  ]);

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
    memUsedMB != null && procAvailableMemoryMB != null && memUsedMB + procAvailableMemoryMB > 0
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
    ...staticInfo,
  };
}
