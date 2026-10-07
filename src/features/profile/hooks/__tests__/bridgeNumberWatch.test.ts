import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BridgeNumberResult } from '@/lib/api/bridgeNumberTypes';
import {
  CLAIM_EVERY_MS,
  createBridgeNumberWatch,
  POLL_MS,
  WAIT_MS,
} from '../bridgeNumberWatch';

const WAITING: BridgeNumberResult = { bridgeNumber: null, status: 'provisioning' };
const NONE: BridgeNumberResult = { bridgeNumber: null, status: 'unavailable' };
const READY: BridgeNumberResult = { bridgeNumber: '+18602374408', status: 'assigned' };

function http(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

/** A server that answers what the test lines up, and counts what it is asked. */
function rig(opts: {
  get: BridgeNumberResult | (() => BridgeNumberResult);
  claim?: BridgeNumberResult | Error | (() => BridgeNumberResult);
}) {
  const asked = { get: 0, claim: 0 };
  let clock = 1_000_000;
  const watch = createBridgeNumberWatch(
    {
      get: async () => {
        asked.get += 1;
        return typeof opts.get === 'function' ? opts.get() : opts.get;
      },
      claim: async () => {
        asked.claim += 1;
        if (opts.claim instanceof Error) throw opts.claim;
        if (typeof opts.claim === 'function') return opts.claim();
        return opts.claim ?? WAITING;
      },
    },
    () => clock
  );
  /** Looks the way the screen does, until the watch says to stop. */
  async function lookUntilItStops(account: string, data: BridgeNumberResult) {
    let looks = 0;
    while (watch.pollMs(account, data) !== false) {
      clock += POLL_MS;
      data = await watch.load(account);
      looks += 1;
      assert.ok(looks < 1000, 'it never stopped looking');
    }
    return looks;
  }
  return { watch, asked, pass: (ms: number) => (clock += ms), lookUntilItStops };
}

test('an account that will never have a number is asked once and never claimed for', async () => {
  const { watch, asked } = rig({ get: NONE });

  const data = await watch.load('300');

  assert.deepEqual(data, NONE);
  assert.deepEqual(asked, { get: 1, claim: 0 });
  assert.equal(watch.pollMs('300', data), false);
});

test('a number that is there is returned without a claim and without looking again', async () => {
  const { watch, asked } = rig({ get: READY });

  const data = await watch.load('281');

  assert.deepEqual(data, READY);
  assert.deepEqual(asked, { get: 1, claim: 0 });
  assert.equal(watch.pollMs('281', data), false);
});

test('a number on its way is claimed once, then looked for every 4 seconds without claiming again', async () => {
  const { watch, asked, pass } = rig({ get: WAITING });

  let data = await watch.load('281');
  assert.equal(watch.pollMs('281', data), POLL_MS);
  for (let i = 0; i < 10; i++) {
    pass(POLL_MS);
    data = await watch.load('281');
  }

  assert.deepEqual(asked, { get: 11, claim: 1 });
  assert.equal(watch.pollMs('281', data), POLL_MS);
});

test('the looking stops by itself two minutes after the claim, with one claim made', async () => {
  const { watch, asked, lookUntilItStops } = rig({ get: WAITING });
  const data = await watch.load('281');

  const looks = await lookUntilItStops('281', data);

  assert.equal(looks, WAIT_MS / POLL_MS);
  assert.deepEqual(asked, { get: looks + 1, claim: 1 });
});

test('the number arriving ends the wait', async () => {
  let ready = false;
  const { watch, asked, pass } = rig({ get: () => (ready ? READY : WAITING) });
  let data = await watch.load('281');
  pass(POLL_MS);
  ready = true;

  data = await watch.load('281');

  assert.deepEqual(data, READY);
  assert.equal(watch.pollMs('281', data), false);
  assert.deepEqual(asked, { get: 2, claim: 1 });
});

test('a claim the server refuses means there is no number, and nothing is looked for', async () => {
  for (const status of [403, 410]) {
    const { watch, asked } = rig({ get: WAITING, claim: http(status) });

    const data = await watch.load('300');

    assert.deepEqual(data, NONE, `HTTP ${status}`);
    assert.equal(watch.pollMs('300', data), false);
    assert.deepEqual(asked, { get: 1, claim: 1 });
  }
});

test('a claim lost on the way is tried again on the next look, and once through is not repeated', async () => {
  let attempts = 0;
  const { watch, asked, pass } = rig({
    get: WAITING,
    claim: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Network Error');
      return WAITING;
    },
  });

  let data = await watch.load('281');
  assert.deepEqual(data, WAITING);
  assert.equal(watch.pollMs('281', data), POLL_MS);
  for (let i = 0; i < 5; i++) {
    pass(POLL_MS);
    data = await watch.load('281');
  }

  assert.deepEqual(asked, { get: 6, claim: 2 });
});

test('a claim that never gets through stops being tried when the two minutes are over', async () => {
  const { watch, asked, lookUntilItStops } = rig({ get: WAITING, claim: http(500) });
  const data = await watch.load('281');

  const looks = await lookUntilItStops('281', data);

  assert.equal(looks, WAIT_MS / POLL_MS);
  assert.deepEqual(asked, { get: looks + 1, claim: looks + 1 });
});

test('opening the screen again inside ten minutes looks once and claims nothing', async () => {
  const { watch, asked, pass, lookUntilItStops } = rig({ get: WAITING });
  await lookUntilItStops('281', await watch.load('281'));
  const before = { ...asked };
  pass(60_000);

  const data = await watch.load('281');

  assert.deepEqual(asked, { get: before.get + 1, claim: before.claim });
  assert.equal(watch.pollMs('281', data), false);
});

test('ten minutes after a claim the next look claims again and opens a new wait', async () => {
  const { watch, asked, pass } = rig({ get: WAITING });
  await watch.load('281');
  pass(CLAIM_EVERY_MS);

  const data = await watch.load('281');

  assert.equal(asked.claim, 2);
  assert.equal(watch.pollMs('281', data), POLL_MS);
});

test('each account has its own wait', async () => {
  const { watch, asked } = rig({ get: WAITING });

  await watch.load('281');
  await watch.load('277');
  await watch.load('281');

  assert.deepEqual(asked, { get: 3, claim: 2 });
  assert.equal(watch.pollMs('277', WAITING), POLL_MS);
  assert.equal(watch.pollMs('999', WAITING), false);
});

test('a plan that gains the number is claimed for at once, even right after a refusal', async () => {
  let entitled = false;
  const { watch, asked } = rig({
    get: WAITING,
    claim: () => {
      if (!entitled) throw http(403);
      return WAITING;
    },
  });
  assert.deepEqual(await watch.load('281'), NONE);
  entitled = true;

  const data = await watch.load('281');

  assert.deepEqual(data, WAITING);
  assert.equal(asked.claim, 2);
  assert.equal(watch.pollMs('281', data), POLL_MS);
});

test('nothing is looked for before the first answer', () => {
  const { watch } = rig({ get: WAITING });
  assert.equal(watch.pollMs('281', undefined), false);
});
