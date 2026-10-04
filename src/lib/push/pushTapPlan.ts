/**
 * Pure decision for a push notification tap: what to do before navigating.
 * Kept free of expo imports so it runs under the node test runner.
 */
export type PushTapPlan =
  | { kind: 'replay_skipped' }
  | { kind: 'no_url' }
  | { kind: 'open'; url: string }
  | { kind: 'switch_then_open'; url: string; accountId: number }
  | { kind: 'recipient_not_on_device'; url: string; accountId: number };

export interface PushTapInput {
  alreadyHandled: boolean;
  url: unknown;
  accountId: unknown;
  activeAccountId: number | null;
  linkedAccountIds: readonly number[];
}

export function planPushTap(input: PushTapInput): PushTapPlan {
  if (input.alreadyHandled) return { kind: 'replay_skipped' };
  const url = typeof input.url === 'string' && input.url.length > 0 ? input.url : null;
  if (!url) return { kind: 'no_url' };
  const accountId = Number(input.accountId);
  // Old pushes carry no account: open as whoever is active (previous behaviour).
  if (input.accountId == null || !Number.isInteger(accountId) || accountId <= 0) {
    return { kind: 'open', url };
  }
  if (input.activeAccountId === accountId) return { kind: 'open', url };
  if (!input.linkedAccountIds.includes(accountId)) {
    return { kind: 'recipient_not_on_device', url, accountId };
  }
  return { kind: 'switch_then_open', url, accountId };
}
