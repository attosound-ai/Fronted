import type { BadgeCounter, UnreadSource } from './types';

export class BadgeService {
  private lastApplied = -1;
  private inflight: Promise<number> | null = null;

  constructor(
    private readonly counter: BadgeCounter,
    private readonly sources: readonly UnreadSource[]
  ) {}

  async recompute(): Promise<number> {
    if (this.inflight) return this.inflight;
    this.inflight = this.runRecompute().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async apply(total: number): Promise<number> {
    const safe = Math.max(0, Math.floor(total));
    if (safe === this.lastApplied) return safe;
    this.lastApplied = safe;
    await this.counter.set(safe);
    return safe;
  }

  async clear(): Promise<void> {
    await this.apply(0);
  }

  private async runRecompute(): Promise<number> {
    const counts = await Promise.all(this.sources.map((s) => s.getCount()));
    const total = counts.reduce((a, b) => a + Math.max(0, b || 0), 0);
    return this.apply(total);
  }
}
