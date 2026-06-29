import { NullAudioInjector } from './NullAudioInjector';

/**
 * ServerAudioInjector — DEFERRED path B (cross-platform via Twilio Media
 * Streams). Reserved behind the same {@link ./AudioInjector#AudioInjector}
 * contract so a future server-side engine (a telephony-service inject route
 * driving the existing Media-Streams gateway) can replace the native one with a
 * ONE-LINE change in createAudioInjector — no caller touched (Open-Closed).
 *
 * It is NOT viable on ATTO's current `<Dial><Client>` topology (bidirectional
 * `<Connect><Stream>` would tear down the live bridge) and cannot satisfy the
 * low-latency local-monitor "rap over a beat" requirement, so it ships inert.
 * Today it behaves exactly like NullAudioInjector (engine_unavailable); the
 * separate type just keeps the seam exercised + makes the future swap explicit.
 */
export class ServerAudioInjector extends NullAudioInjector {
  // Inherits the inert no-op behavior. When implemented, override start/stop to
  // POST to telephony-service and reflect server stream state into snapshots.
}
