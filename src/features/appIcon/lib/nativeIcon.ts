import { Platform } from 'react-native';
import type { AppIconSlot } from '../types';

/**
 * Thin wrapper around @howincodes/expo-dynamic-app-icon that:
 *   - lazy-requires the native module (so JS bundlers / web targets don't
 *     blow up on the native symbols),
 *   - normalises the return value (some versions return `false` on failure,
 *     others throw), and
 *   - treats `null` slot as "revert to primary".
 *
 * iOS WILL show the system confirmation dialog ("You have changed the icon
 * for ATTO") — that is a UIKit-level alert and cannot be suppressed through
 * any public API. We use only the public path; private-API silent swap is
 * intentionally NOT used to keep the App Store rejection risk at zero.
 */

type DynamicAppIconModule = {
  setAppIcon: (name: string | null) => Promise<string | false>;
  getAppIcon: () => string;
};

let cached: DynamicAppIconModule | null = null;

function loadModule(): DynamicAppIconModule | null {
  if (cached) return cached;
  // The package ships native modules — only available on iOS/Android.
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
 * the primary icon. Resolves to `true` on success (the system dialog will
 * have been shown to the user on iOS), `false` otherwise.
 */
export async function setNativeAppIcon(slot: AppIconSlot): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const result = await mod.setAppIcon(slot);
    return result !== false;
  } catch {
    return false;
  }
}

/**
 * Read the currently active icon slot. Returns `null` when the primary
 * icon is active, the slot name otherwise. Useful at boot to hydrate the
 * picker's "selected" highlight independent of the local store.
 */
export function getNativeAppIcon(): AppIconSlot {
  const mod = loadModule();
  if (!mod) return null;
  try {
    const current = mod.getAppIcon();
    // The library returns the string 'DEFAULT' for the primary icon.
    if (!current || current === 'DEFAULT') return null;
    return current;
  } catch {
    return null;
  }
}
