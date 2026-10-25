import { Image } from 'react-native';

/**
 * The ATTO + SOUND wordmark shipped inside the app (same file the admin set as
 * the header logo). The old default lived on the da9vymoah Cloudinary account,
 * which Cloudinary disabled around Oct 10 2026 ("cloud_name ... is disabled",
 * HTTP 401), so any header that depended on it drew nothing. The brand must
 * never need the network to show up.
 */
export const BUNDLED_WORDMARK = require('../../../../assets/header-wordmark.png');

/** Same image as a uri, for viewers that take a string. */
export const BUNDLED_WORDMARK_URI: string =
  Image.resolveAssetSource(BUNDLED_WORDMARK).uri;

/** Cloudinary cloud name of a remote image, for telemetry (null when not Cloudinary). */
export function cloudinaryCloudOf(uri: string): string | null {
  const match = /res\.cloudinary\.com\/([^/]+)\//.exec(uri);
  return match ? match[1] : null;
}
