/**
 * Catalog of dynamic app icons.
 *
 * The mobile app ships a fixed set of icon *slots* in the binary (declared in
 * app.json via @howincodes/expo-dynamic-app-icon). The backend stores the
 * user-facing metadata (display name, preview thumbnail, sort order, active
 * flag) for each slot — admins manage that catalogue from the web admin
 * without a new build. To add or remove a slot from the picker the developer
 * still has to ship a new binary.
 *
 * `slotName` is the contract between this metadata and the binary: it MUST
 * exactly match one of the keys declared in app.json's expo plugin block.
 * `null` slot represents the primary (default) icon and is never stored in
 * the catalog — it's rendered client-side as the first tile.
 */

/** Wire shape returned by GET /api/v1/content/app-icons. */
export interface BackendAppIcon {
  id: string;
  slotName: string;
  name: string;
  previewUrl: string;
  sortOrder?: number | null;
  createdAt?: string | null;
}

export interface AppIcon {
  id: string;
  slotName: string;
  name: string;
  previewUrl: string;
  sortOrder: number;
  createdAt: string | null;
}

/** Slot identifier of the user's currently selected icon, or null for default. */
export type AppIconSlot = string | null;
