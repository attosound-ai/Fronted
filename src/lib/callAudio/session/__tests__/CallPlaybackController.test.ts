/**
 * State machine tests for CallPlaybackController with a fake native session,
 * a fake preparer and a recording telemetry sink. Runs under `node --test`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CallPlaybackController, PLAYBACK_EVENTS } from '../CallPlaybackController';
import type {
  NativeSessionModule,
  NativeSessionStatus,
  PlaybackPreparer,
  PlaybackSource,
  PlaybackTelemetry,
  PreparedStems,
  PrepareToken,
} from '../types';

class FakeNative implements NativeSessionModule {
  status: NativeSessionStatus = {
    state: 'idle',
    positionMs: 0,
    durationMs: 0,
    transmit: false,
    monitor: true,
    loop: false,
    loopCount: 0,
    levelRms: 0,
    generation: 0,
  };
  calls: string[] = [];
  failNext: string | null = null;

  private bump(reason: string): NativeSessionStatus {
    this.status = { ...this.status, generation: this.status.generation + 1, reason };
    return this.status;
  }
  private maybeFail(name: string): void {
    this.calls.push(name);
    if (this.failNext === name) {
      this.failNext = null;
      throw new Error(`${name} failed`);
    }
  }
  async sessionLoad(stems: { path: string; gain: number }[], loop: boolean) {
    this.maybeFail('sessionLoad');
    this.status = {
      ...this.status,
      state: 'loaded',
      durationMs: 4000 * stems.length,
      loop,
      positionMs: 0,
    };
    return this.bump('loaded');
  }
  async sessionSetStem() {
    this.maybeFail('sessionSetStem');
    return this.bump('stem_swap');
  }
  async sessionSetStemGain() {
    this.maybeFail('sessionSetStemGain');
    return true;
  }
  async sessionPlay(fromMs: number) {
    this.maybeFail('sessionPlay');
    const from =
      fromMs >= 0 ? fromMs : this.status.state === 'ended' ? 0 : this.status.positionMs;
    this.status = { ...this.status, state: 'playing', positionMs: from };
    return this.bump('play');
  }
  async sessionPause() {
    this.maybeFail('sessionPause');
    this.status = { ...this.status, state: 'paused' };
    return this.bump('pause');
  }
  async sessionSeek(ms: number) {
    this.maybeFail('sessionSeek');
    this.status = { ...this.status, positionMs: ms };
    return this.bump('seek');
  }
  async sessionStop(reason: string) {
    this.maybeFail('sessionStop');
    this.status = { ...this.status, state: 'idle', positionMs: 0, durationMs: 0 };
    return this.bump(reason);
  }
  async sessionSetTransmit(on: boolean) {
    this.maybeFail('sessionSetTransmit');
    this.status = { ...this.status, transmit: on };
    return true;
  }
  async sessionSetMonitor(on: boolean) {
    this.maybeFail('sessionSetMonitor');
    this.status = { ...this.status, monitor: on };
    return true;
  }
  async sessionGetStatus() {
    this.calls.push('sessionGetStatus');
    return this.status;
  }
}

class FakePreparer implements PlaybackPreparer {
  delayMs = 0;
  fail = false;
  cancelled: PrepareToken[] = [];
  async prepare(source: PlaybackSource, token: PrepareToken): Promise<PreparedStems> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (token.cancelled) throw new Error('cancelled');
    if (this.fail) throw new Error('boom');
    const stems =
      source.type === 'file'
        ? [{ path: `canon:${source.uri}`, gain: 1 }]
        : source.stems.map((s, i) => ({ path: `stem:${i}`, gain: s.gain }));
    return {
      stems,
      durationMs: 4000 * stems.length,
      cacheHit: false,
      downloadMs: 1,
      encodeMs: 1,
      renderMs: 0,
      bytes: 10,
    };
  }
  async prepareStem() {
    return { path: 'stem:new', renderMs: 3, cacheHit: false };
  }
  cancel(token: PrepareToken): void {
    token.cancelled = true;
    this.cancelled.push(token);
  }
}

class Recorder implements PlaybackTelemetry {
  events: { event: string; props: Record<string, unknown> }[] = [];
  crumbs: string[] = [];
  warnings: string[] = [];
  capture(event: string, props: Record<string, unknown>) {
    this.events.push({ event, props });
  }
  breadcrumb(message: string) {
    this.crumbs.push(message);
  }
  context() {}
  warn(message: string) {
    this.warnings.push(message);
  }
  of(event: string) {
    return this.events.filter((e) => e.event === event).map((e) => e.props);
  }
}

const post: PlaybackSource = { type: 'file', kind: 'post', uri: 'https://cdn/a.m4a' };
const ON = { engine: true, timeline: true, video: true };

function make(opts: { native?: boolean; frames?: number[] } = {}) {
  const native = opts.native === false ? null : new FakeNative();
  const preparer = new FakePreparer();
  const telemetry = new Recorder();
  // Successive reads of the injector's frame counter, so a test can say what
  // the far party received between the gate opening and closing.
  const queue = [...(opts.frames ?? [])];
  let lastFrames: number | null = null;
  const framesToCall = async () => {
    if (queue.length > 0) lastFrames = queue.shift() ?? null;
    return lastFrames;
  };
  const controller = new CallPlaybackController({
    native,
    preparer,
    telemetry,
    framesToCall: opts.frames ? framesToCall : undefined,
  });
  return { controller, native, preparer, telemetry };
}

describe('engine mode', () => {
  it('refuses claims while the mode is off and reports the gate', async () => {
    const { controller } = make();
    const r = await controller.claim('p1', 'feed_audio', post);
    assert.deepEqual(r, { ok: false, reason: 'no_engine_mode' });
  });

  it('closes the gate and stops a ghost session when latched', async () => {
    const { controller, native, telemetry } = make();
    native!.status = { ...native!.status, state: 'playing', transmit: true };
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    assert.ok(native!.calls.includes('sessionStop'));
    assert.ok(native!.calls.includes('sessionSetTransmit'));
    assert.equal(native!.status.transmit, false);
    assert.equal(telemetry.warnings[0], 'call_playback_ghost_session');
    assert.equal(telemetry.of(PLAYBACK_EVENTS.ENGINE_MODE)[0].engine_mode, true);
  });
});

describe('claim and transport', () => {
  it('claims, plays, pauses, seeks and stops with telemetry on every step', async () => {
    const { controller, native, telemetry } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    const claimed = await controller.claim('p1', 'feed_audio', post);
    assert.equal(claimed.ok, true);
    assert.equal(controller.getSnapshot().status, 'ready');
    assert.equal(controller.getSnapshot().durationMs, 4000);

    assert.equal((await controller.play('p1')).ok, true);
    assert.equal(controller.getSnapshot().status, 'playing');
    assert.equal((await controller.seek('p1', 1500)).ok, true);
    assert.equal(controller.getSnapshot().positionMs, 1500);
    assert.equal((await controller.pause('p1')).ok, true);
    assert.equal(controller.getSnapshot().status, 'paused');
    assert.equal((await controller.toggle('p1')).ok, true);
    assert.equal(controller.getSnapshot().status, 'playing');
    await controller.stop('p1', 'stop');
    assert.equal(controller.getSnapshot().status, 'idle');
    assert.equal(native!.status.state, 'idle');

    const actions = telemetry.of(PLAYBACK_EVENTS.TRANSPORT).map((p) => p.action);
    assert.deepEqual(actions, ['play', 'seek', 'pause', 'play', 'stop']);
    assert.equal(telemetry.of(PLAYBACK_EVENTS.CLAIM)[0].outcome, 'ready');
  });

  it('honours a play that arrives during the prepare', async () => {
    const { controller, preparer } = make();
    preparer.delayMs = 20;
    await controller.setEngineMode(ON, 'CA1', {});
    const claiming = controller.claim('p1', 'feed_audio', post);
    assert.equal(controller.getSnapshot().status, 'preparing');
    await controller.play('p1');
    await claiming;
    assert.equal(controller.getSnapshot().status, 'playing');
  });

  it('ignores transport from a surface that is not the owner', async () => {
    const { controller } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    await controller.claim('p1', 'feed_audio', post);
    assert.deepEqual(await controller.play('p2'), { ok: false, reason: 'superseded' });
    assert.equal(controller.getSnapshot().status, 'ready');
  });

  it('a newer claim supersedes an in flight prepare and cancels it', async () => {
    const { controller, preparer, telemetry } = make();
    preparer.delayMs = 30;
    await controller.setEngineMode(ON, 'CA1', {});
    const first = controller.claim('p1', 'feed_audio', post);
    const second = controller.claim('p2', 'chat_audio', {
      type: 'file',
      kind: 'message',
      uri: 'm',
    });
    const [r1, r2] = await Promise.all([first, second]);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'superseded');
    assert.equal(r2.ok, true);
    assert.equal(controller.getSnapshot().ownerId, 'p2');
    assert.equal(preparer.cancelled.length, 1);
    const outcomes = telemetry.of(PLAYBACK_EVENTS.CLAIM).map((p) => p.outcome);
    assert.ok(outcomes.includes('prepare_cancelled') || outcomes.includes('superseded'));
    assert.ok(outcomes.includes('ready'));
  });

  it('reports a failed prepare and leaves the session unloaded', async () => {
    const { controller, preparer, native } = make();
    preparer.fail = true;
    await controller.setEngineMode(ON, 'CA1', {});
    const r = await controller.claim('p1', 'feed_audio', post);
    assert.deepEqual(r, { ok: false, reason: 'prepare_failed' });
    assert.equal(controller.getSnapshot().status, 'error');
    assert.ok(!native!.calls.includes('sessionLoad'));
  });

  it('reports an engine error from the native load', async () => {
    const { controller, native } = make();
    native!.failNext = 'sessionLoad';
    await controller.setEngineMode(ON, 'CA1', {});
    const r = await controller.claim('p1', 'feed_audio', post);
    assert.deepEqual(r, { ok: false, reason: 'engine_error' });
  });

  it('is not supported without the native bridge', async () => {
    const { controller } = make({ native: false });
    await controller.setEngineMode(ON, 'CA1', {});
    assert.deepEqual(await controller.claim('p1', 'feed_audio', post), {
      ok: false,
      reason: 'not_supported',
    });
  });
});

describe('transmit gate', () => {
  it('is independent of the transport and starts off on every call', async () => {
    const { controller, native, telemetry } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    await controller.setTransmit(true, { surface: 'call_bar' });
    assert.equal(native!.status.transmit, true);
    assert.equal(controller.getSnapshot().transmit, true);
    // Nothing started: the gate is armed only.
    assert.equal(controller.getSnapshot().status, 'idle');

    await controller.claim('p1', 'feed_audio', post);
    await controller.play('p1');
    assert.equal(controller.getSnapshot().status, 'playing');
    await controller.setTransmit(false);
    // Turning the gate off never stops playback.
    assert.equal(controller.getSnapshot().status, 'playing');
    assert.equal(native!.status.state, 'playing');

    const toggles = telemetry.of(PLAYBACK_EVENTS.TRANSMIT_TOGGLED);
    assert.equal(toggles[0].on, true);
    assert.equal(toggles[0].was_playing, false);
    assert.equal(toggles[1].on, false);
    assert.equal(toggles[1].was_playing, true);

    await controller.resetForCallEnd();
    assert.equal(native!.status.transmit, false);
    assert.equal(controller.getSnapshot().transmit, false);
    assert.equal(controller.getSnapshot().engineMode, false);
  });
});

describe('native events', () => {
  it('maps ticks, ended and device idle onto the snapshot', async () => {
    const { controller, native, telemetry } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    await controller.claim('p1', 'feed_audio', post);
    await controller.play('p1');
    controller.handleNativeEvent({ ...native!.status, positionMs: 2500, reason: 'tick' });
    assert.equal(controller.getSnapshot().positionMs, 2500);
    controller.handleNativeEvent({
      ...native!.status,
      state: 'ended',
      positionMs: 4000,
      reason: 'track_ended',
    });
    assert.equal(controller.getSnapshot().status, 'ended');
    assert.equal(controller.getSnapshot().reason, 'track_ended');
    assert.ok(telemetry.of(PLAYBACK_EVENTS.TRANSPORT).some((p) => p.action === 'ended'));

    await controller.play('p1');
    controller.handleNativeEvent({
      ...native!.status,
      state: 'playing',
      reason: 'engine_rebuild',
    });
    assert.equal(
      telemetry.of(PLAYBACK_EVENTS.RESCHEDULE)[0].native_reason,
      'engine_rebuild'
    );
    controller.handleNativeEvent({
      ...native!.status,
      state: 'paused',
      reason: 'device_idle',
    });
    assert.equal(controller.getSnapshot().status, 'paused');
    assert.equal(controller.getSnapshot().reason, 'device_idle');
  });

  it('ignores ticks while a claim is preparing', async () => {
    const { controller, preparer, native } = make();
    preparer.delayMs = 20;
    await controller.setEngineMode(ON, 'CA1', {});
    const claiming = controller.claim('p1', 'feed_audio', post);
    controller.handleNativeEvent({
      ...native!.status,
      state: 'playing',
      positionMs: 900,
      reason: 'tick',
    });
    assert.equal(controller.getSnapshot().status, 'preparing');
    await claiming;
  });
});

describe('stems', () => {
  it('replaces one stem in place and pushes live gains', async () => {
    const { controller, native, telemetry } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    const stems = [
      { totalFrames: 48000, clips: [], gain: 1 },
      { totalFrames: 48000, clips: [], gain: 0.5 },
    ];
    await controller.claim('t1', 'timeline', {
      type: 'stems',
      kind: 'timeline',
      stems,
      key: 'k1',
    });
    await controller.play('t1');
    await controller.setStemGain('t1', 1, 0);
    assert.ok(native!.calls.includes('sessionSetStemGain'));
    const r = await controller.replaceStem('t1', 1, {
      totalFrames: 48000,
      clips: [],
      gain: 0.7,
    });
    assert.equal(r.ok, true);
    assert.ok(native!.calls.includes('sessionSetStem'));
    assert.equal(controller.getSnapshot().status, 'playing');
    assert.equal(telemetry.of(PLAYBACK_EVENTS.STEM_RENDER)[0].outcome, 'ok');
  });
});

describe('call lifecycle', () => {
  it('release only touches the owner and call end clears everything', async () => {
    const { controller, native } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    await controller.claim('p1', 'feed_audio', post);
    await controller.release('p2');
    assert.equal(controller.getSnapshot().ownerId, 'p1');
    await controller.release('p1');
    assert.equal(controller.getSnapshot().status, 'idle');

    await controller.claim('p3', 'chat_audio', post);
    await controller.play('p3');
    await controller.resetForCallEnd();
    assert.equal(controller.getSnapshot().status, 'idle');
    assert.equal(controller.getSnapshot().ownerId, null);
    assert.equal(native!.status.state, 'idle');
    // After the call, claims are refused until the next latch.
    assert.deepEqual(await controller.claim('p4', 'feed_audio', post), {
      ok: false,
      reason: 'no_engine_mode',
    });
  });

  it('turning the mode off mid session stops it', async () => {
    const { controller } = make();
    await controller.setEngineMode(ON, 'CA1', {});
    await controller.claim('p1', 'feed_audio', post);
    await controller.play('p1');
    await controller.setEngineMode(
      { engine: false, timeline: false, video: false },
      'CA1',
      {}
    );
    assert.equal(controller.getSnapshot().status, 'idle');
    assert.equal(controller.getSnapshot().reason, 'engine_mode_off');
  });
});

/**
 * The contract David confirmed on Sep 25 2026: one session for the call, the
 * transport says what you hear, and transmitting is a separate switch that
 * never touches it.
 */
describe('transmit is a gate, never a transport', () => {
  it('leaves the transport exactly where it was, in both directions', async () => {
    const { controller, native } = make();
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    await controller.claim('timeline', 'timeline', post);
    await controller.play('timeline');
    assert.equal(controller.getSnapshot().status, 'playing');

    const before = native!.calls.length;
    await controller.setTransmit(true, { surface: 'timeline' });
    assert.equal(controller.getSnapshot().status, 'playing');
    await controller.setTransmit(false, { surface: 'timeline' });
    assert.equal(controller.getSnapshot().status, 'playing');

    // Only the two gate writes reached the engine; no play, pause or seek.
    const added = native!.calls.slice(before);
    assert.deepEqual(added, ['sessionSetTransmit', 'sessionSetTransmit']);
  });

  it('can be left open while paused, and pausing does not close it', async () => {
    const { controller } = make();
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    await controller.claim('timeline', 'timeline', post);
    await controller.play('timeline');
    await controller.setTransmit(true, { surface: 'timeline' });
    await controller.pause('timeline');
    assert.equal(controller.getSnapshot().status, 'paused');
    assert.equal(controller.getSnapshot().transmit, true);
  });

  it('reports how many frames reached the far party while the gate was open', async () => {
    const { controller, telemetry } = make({ frames: [1000, 4000] });
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    await controller.claim('timeline', 'timeline', post);
    await controller.play('timeline');
    await controller.setTransmit(true, { surface: 'timeline' });
    await controller.setTransmit(false, { surface: 'timeline' });

    const summary = telemetry.events.find(
      (e) => e.event === PLAYBACK_EVENTS.TRANSMIT_SUMMARY
    );
    assert.ok(summary, 'a transmission reports what it delivered');
    assert.equal(summary.props.frames_to_call, 3000);
    assert.equal(summary.props.frames_before, 1000);
    assert.equal(summary.props.frames_after, 4000);
  });

  it('says nothing was delivered when the counter never moved', async () => {
    const { controller, telemetry } = make({ frames: [7000, 7000] });
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    await controller.claim('timeline', 'timeline', post);
    await controller.play('timeline');
    await controller.setTransmit(true, { surface: 'timeline' });
    await controller.setTransmit(false, { surface: 'timeline' });

    const summary = telemetry.events.find(
      (e) => e.event === PLAYBACK_EVENTS.TRANSMIT_SUMMARY
    );
    assert.equal(summary?.props.frames_to_call, 0);
  });
});

describe('one session per call, not one per mount', () => {
  it('a second claim from the same owner never takes the session from itself', async () => {
    const { controller, telemetry } = make();
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    await controller.claim('timeline', 'timeline', post);
    await controller.claim('timeline', 'timeline', post);

    const stolen = telemetry.events.filter(
      (e) => e.event === PLAYBACK_EVENTS.TRANSPORT && e.props.action === 'superseded'
    );
    assert.equal(stolen.length, 0);
    assert.equal(controller.getSnapshot().ownerId, 'timeline');
  });

  it('a different owner does take it, and says who took it', async () => {
    const { controller, telemetry } = make();
    await controller.setEngineMode(ON, 'CA1', { flag: true });
    await controller.claim('timeline', 'timeline', post);
    await controller.claim('feed:9', 'feed_audio', post);

    const stolen = telemetry.events.filter(
      (e) => e.event === PLAYBACK_EVENTS.TRANSPORT && e.props.action === 'superseded'
    );
    assert.equal(stolen.length, 1);
    assert.equal(stolen[0].props.by_owner, 'feed:9');
  });
});
