import { showToast } from './Toast';
import i18n from '@/lib/i18n';
import {
  getConnectivity,
  classifyNetFailure,
  netFailureKey,
} from '@/lib/net/connectivity';

/**
 * Show the clearest possible toast for a failed network operation. Takes the
 * caught error and a short, already-translated ACTION noun ("Saving your
 * recording", "Publishing") and picks offline / weak-signal / server / generic
 * wording from a live connectivity check, so the same failure never reads as a
 * vague "failed" again.
 *
 * This is the one call every network catch-block should use, so no operation
 * fails silently and they all speak the same language about the network.
 */
export async function showNetFailureToast(error: unknown, action: string): Promise<void> {
  const conn = await getConnectivity();
  const kind = classifyNetFailure(error, conn);
  // defaultValue both satisfies i18next's typed-key overload for a dynamic key
  // and guarantees a sane message if a translation is ever missing.
  showToast(
    i18n.t(`common:${netFailureKey(kind)}`, {
      action,
      defaultValue: `${action} failed.`,
    })
  );
}
