/**
 * How the bridge number is asked for, without React.
 *
 * Until Oct 7 2026 Settings asked every 4 seconds for as long as it stayed
 * open, for any account without a number, and every round carried a claim.
 * An account that can never have one got a 403 every 4 seconds (50 from one
 * account in three days), and a creator whose number was slow to arrive asked
 * telephony to provision it every 4 seconds.
 *
 * Now the server says when there will be none ('unavailable') and nothing
 * more is asked. A claim opens a wait of two minutes in which the number is
 * looked for every 4 seconds; then the screen stops looking. Nothing is
 * claimed twice inside ten minutes, unless the claim itself did not get
 * through.
 */
import type { BridgeNumberResult } from '@/lib/api/bridgeNumberTypes';

/** Between two looks while a number is on its way. */
export const POLL_MS = 4000;
/** A number lands in seconds; this is how long it is looked for after a claim. */
export const WAIT_MS = 2 * 60 * 1000;
/** A claim asks telephony to provision: one is enough for this long. */
export const CLAIM_EVERY_MS = 10 * 60 * 1000;

export interface BridgeNumberApi {
  get: () => Promise<BridgeNumberResult>;
  claim: () => Promise<BridgeNumberResult>;
}

const NONE: BridgeNumberResult = { bridgeNumber: null, status: 'unavailable' };

/** The server's "this account, or this plan, has no number" (or no account). */
function refused(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 410;
}

/** No number yet, and the server says one is coming. */
export function onItsWay(data: BridgeNumberResult | undefined): boolean {
  return !!data && !data.bridgeNumber && data.status === 'provisioning';
}

export function createBridgeNumberWatch(
  api: BridgeNumberApi,
  now: () => number = Date.now
) {
  // Per account: when its wait began, and whether the claim got through.
  const waits = new Map<string, { from: number; claimed: boolean }>();

  return {
    async load(account: string): Promise<BridgeNumberResult> {
      const current = await api.get();
      if (!onItsWay(current)) {
        waits.delete(account);
        return current;
      }
      const wait = waits.get(account);
      const fresh = !wait || now() - wait.from >= CLAIM_EVERY_MS;
      if (!fresh && wait.claimed) return current;
      const from = fresh ? now() : wait.from;
      try {
        const answer = await api.claim();
        waits.set(account, { from, claimed: true });
        return answer;
      } catch (error) {
        if (refused(error)) {
          waits.delete(account);
          return NONE;
        }
        // Lost on the way: the next look tries again, inside the same wait.
        waits.set(account, { from, claimed: false });
        return current;
      }
    },

    /** How long until the next look, or false to stop looking. */
    pollMs(account: string, data: BridgeNumberResult | undefined): number | false {
      const wait = waits.get(account);
      const waiting = !!wait && now() - wait.from < WAIT_MS;
      return onItsWay(data) && waiting ? POLL_MS : false;
    },
  };
}
