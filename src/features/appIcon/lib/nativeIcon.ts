import { Platform } from 'react-native';
import type { AppIconSlot } from '../types';

/**
 * Thin wrapper around @howincodes/expo-dynamic-app-icon that:
 *   - lazy-requires the native module (so JS bundlers / web targets don't
 *     blow up on the native symbols),
 *   - normalises the return value (success returns the slot name string;
 *     failure returns `false`),
 *   - treats `null` slot as "revert to primary".
 *
 * iOS WILL show the system confirmation dialog ("You have changed the icon
 * for ATTO"). That is UIKit-level and cannot be suppressed through any
 * public API. We deliberately use only the public `setAlternateIconName`
 * path (the plugin's `isInBackground: false` mode) — the private API
 * (`_setAlternateIconName:` selector) would suppress the alert but raises
 * the App Store rejection risk, which is not the trade-off we want.
 */

// Plugin signature (per @howincodes/expo-dynamic-app-icon v3.0.2):
//   AsyncFunction("setAppIcon") { (name: String?, isInBackground: Bool, promise) in ... }
//   AsyncFunction("getAppIcon") { (promise) in ... }
// Both are AsyncFunction → return Promises. `setAppIcon` resolves to the
// slot name string on success and the boolean `false` on failure.
type DynamicAppIconModule = {
  setAppIcon: (name: string | null, isInBackground: boolean) => Promise<string | false>;
  getAppIcon: () => Promise<string>;
};

let cached: DynamicAppIconModule | null = null;

function loadModule(): DynamicAppIconModule | null {
  if (cached) return cached;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@howincodes/expo-dynamic-app-icon') as DynamicAppIconModule;
    return cached;
  } catch {
    return null;
  }
}

/**
 * Switch the home-screen icon to the given slot, or `null` to revert to
 * the primary icon. Resolves to `true` on success, `false` otherwise.
 *
 * The most common cause of `false` here is a stale prebuild: the slot is
 * advertised by the backend catalogue + declared in `app.json`, but the
 * Info.plist on device doesn't have the matching `CFBundleAlternateIcons`
 * entry because `expo run:ios` reused a cached `ios/` directory. Fix:
 * `npx expo prebuild --clean && pnpm expo run:ios --device`. In dev we
 * log the underlying error so this kind of mismatch is obvious in the
 * Metro console instead of just rolling the picker back to Default.
 */
/**
 * Outcome of a swap attempt. `ok: false` carries a coarse reason so analytics
 * can bucket production failures (most importantly: distinguishing the iOS
 * `LSIconAlertManager` EAGAIN bug from other failure modes, which informs
 * different user-facing copy and product decisions).
 */
/**
 * `diag` is the full structured payload from the patched native module. Shape
 * mirrors `ExpoDynamicAppIconModule.swift::diag(...)` — flat string/number/bool
 * fields safe to send straight to PostHog as event properties.
 */
export type SetAppIconDiag = {
  stage?: string;
  via?: string;
  requested?: string;
  pre_icon?: string;
  post_icon?: string;
  error_domain?: string;
  error_code?: number;
  error_description?: string;
  error_user_info?: string;
  supports_alternate_icons?: boolean;
  cf_bundle_icon_name?: string;
  cf_bundle_icons_present?: boolean;
} & Record<string, unknown>;

export type SetAppIconOutcome =
  | { ok: true; diag?: SetAppIconDiag }
  | {
      ok: false;
      reason: 'no_module' | 'eagain' | 'unsupported' | 'silent_rollback' | 'native_error' | 'threw';
      diag?: SetAppIconDiag;
      rawResult?: unknown;
    };

function parseDiag(result: unknown): SetAppIconDiag | undefined {
  if (typeof result !== 'string' || !result.startsWith('DIAG:')) return undefined;
  try {
    return JSON.parse(result.slice(5)) as SetAppIconDiag;
  } catch {
    return undefined;
  }
}

export async function setNativeAppIconWithReason(slot: AppIconSlot): Promise<SetAppIconOutcome> {
  const mod = loadModule();
  if (!mod) {
    if (__DEV__) console.warn('[appIcon] native module not available');
    return { ok: false, reason: 'no_module' };
  }
  try {
    const result = await mod.setAppIcon(slot, true);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[appIcon] ← setAppIcon result:', result);
    }

    // Legacy false path (kept for safety, but the patched native module
    // always returns either the slot name string or a "DIAG:{...}" string).
    if (result === false) return { ok: false, reason: 'native_error', rawResult: result };

    if (typeof result === 'string' && result.startsWith('DIAG:')) {
      const diag = parseDiag(result);
      const stage = diag?.stage;
      const domain = diag?.error_domain;
      const code = diag?.error_code;

      let reason: Extract<SetAppIconOutcome, { ok: false }>['reason'] = 'native_error';
      if (stage === 'guard_supports') reason = 'unsupported';
      else if (stage === 'silent_rollback') reason = 'silent_rollback';
      else if (domain === 'NSPOSIXErrorDomain' && code === 35) reason = 'eagain';

      return { ok: false, reason, diag, rawResult: result };
    }

    // Success path — Swift resolves with the slot name on true success.
    return { ok: true };
  } catch (err) {
    if (__DEV__) {
      console.warn('[appIcon] setAppIcon THREW for slot %s:', slot ?? '<default>', err);
    }
    return { ok: false, reason: 'threw' };
  }
}

/** Backwards-compatible boolean wrapper. */
export async function setNativeAppIcon(slot: AppIconSlot): Promise<boolean> {
  const mod = loadModule();
  if (!mod) {
    if (__DEV__) console.warn('[appIcon] native module not available');
    return false;
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[appIcon] → setAppIcon', {
      slot: slot ?? '<default>',
      isInBackground: false,
      moduleHasFn: typeof mod.setAppIcon === 'function',
    });
  }
  // Use the plugin's "background" code path (`isInBackground: true`). This
  // routes through `_setAlternateIconName:completionHandler:` (private
  // selector, obfuscated via NSSelectorFromString inside the plugin) which
  // bypasses `LSIconAlertManager` entirely — the public-API path was
  // consistently failing with NSPOSIXErrorDomain code 35 ("Resource
  // temporarily unavailable") on iOS 18+/26 even after a device reboot
  // (Apple Forum thread 812125, confirmed on this codebase 2026-05-20).
  // The selector-obfuscation in @howincodes/expo-dynamic-app-icon is what
  // gets this past App Store static analysis; the plugin is shipping in
  // production apps today. As a side benefit, this also suppresses the
  // system confirmation dialog for a smoother swap.
  try {
    const result = await mod.setAppIcon(slot, true);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[appIcon] ← setAppIcon result:', result);
    }
    return result !== false;
  } catch (err) {
    if (__DEV__) {
      console.warn('[appIcon] setAppIcon THREW for slot %s:', slot ?? '<default>', err);
    }
    return false;
  }
}

/**
 * Read the currently active icon slot. Returns `null` when the primary
 * icon is active, the slot name otherwise. Useful at boot to hydrate the
 * picker's "selected" highlight independent of the local store.
 *
 * Note: the plugin's `getAppIcon` is asynchronous (returns a Promise), so
 * this wrapper is async too. The previous synchronous-looking signature
 * was a silent bug — it returned a Promise object which never equals the
 * string 'DEFAULT', leaving the selection state stale.
 */
export async function getNativeAppIcon(): Promise<AppIconSlot> {
  const mod = loadModule();
  if (!mod) return null;
  try {
    const current = await mod.getAppIcon();
    if (!current || current === 'DEFAULT') return null;
    return current;
  } catch {
    return null;
  }
}
