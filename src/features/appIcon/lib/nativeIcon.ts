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
export async function setNativeAppIcon(slot: AppIconSlot): Promise<boolean> {
  const mod = loadModule();
  if (!mod) {
    if (__DEV__) console.warn('[appIcon] native module not available');
    return false;
  }
  try {
    // Second arg `isInBackground=false` → use the public iOS API only. The
    // plugin's two-arg signature is REQUIRED — passing one arg makes the
    // native module reject the call (silent failure, picker rolls back).
    const result = await mod.setAppIcon(slot, false);
    return result !== false;
  } catch (err) {
    if (__DEV__) {
      console.warn('[appIcon] setAppIcon failed for slot %s:', slot ?? '<default>', err);
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
