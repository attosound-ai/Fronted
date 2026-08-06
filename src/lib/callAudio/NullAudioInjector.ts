import {
  type AudioInjector,
  type InjectionSnapshot,
  type InjectReason,
  type InjectResult,
  type InjectSource,
  IDLE_SNAPSHOT,
} from './AudioInjector';

/**
 * NullAudioInjector — the inert engine returned whenever injection is OFF: the
 * feature flag is disabled, the platform is unsupported, or no concrete engine
 * is installed yet. Every action is a safe no-op that resolves
 * `{ ok: false, reason: 'engine_unavailable' }`, so callers behave identically
 * to "feature absent" without any conditional logic at the call sites.
 *
 * It also carries the reusable snapshot + subscriber plumbing that the real
 * engines reuse, keeping the contract's observation model in one place.
 */
export class NullAudioInjector implements AudioInjector {
  protected snapshot: InjectionSnapshot = { ...IDLE_SNAPSHOT };
  private listeners = new Set<(s: InjectionSnapshot) => void>();

  /** Why this injector is inert (overridden by subclasses; never throws). */
  protected readonly unavailableReason: InjectReason = 'engine_unavailable';

  isSupported(): boolean {
    return false;
  }

  async prefetch(_source: InjectSource): Promise<void> {
    // no-op: nothing to warm when injection is unavailable
  }

  async start(_source: InjectSource): Promise<InjectResult> {
    return { ok: false, reason: this.unavailableReason };
  }

  async stop(_reason: InjectReason): Promise<void> {
    // no-op: nothing is ever playing
  }

  async pause(): Promise<void> {}

  async resume(): Promise<void> {}

  setVolume(_volume: number): void {}

  setMonitor(_on: boolean): void {}

  getState(): InjectionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: InjectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Shared helper for concrete engines: merge + broadcast a new snapshot. */
  protected emit(partial: Partial<InjectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
