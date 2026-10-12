import * as SecureStore from 'expo-secure-store';

import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Editor preferences, one for one with SoundLab's Preference screen plus the
 * tips flag. They live on the device: they are how this person likes the
 * editor, not part of the project.
 */
const KEY_TIPS_SEEN = 'studio.tipsSeen.v1';
// Keychain copy of the tips flag (Oct 12 2026, David: the tips showed again on a
// phone that had seen them). The keychain survives a reinstall and any failure
// of the local store, so once seen they never show by themselves again.
const KEYCHAIN_TIPS_SEEN = 'atto_studio_tips_seen_v1';

function keychainTipsSeen(): boolean {
  try {
    return SecureStore.getItem(KEYCHAIN_TIPS_SEEN) === '1';
  } catch {
    return false;
  }
}
const KEY_PREVIEW_SECONDS = 'studio.previewSeconds';
const KEY_TIMELINE_MARKER = 'studio.timelineMarker';
const KEY_REDUCE_ANIMATION = 'studio.reduceAnimation';
const KEY_SHOW_TRACK_INDEX = 'studio.showTrackIndex';
const KEY_KEEP_PLAYING_ON_ZOOM = 'studio.keepPlayingOnZoom';

export type TimelineMarker = 'timecode' | 'second';

const flag = (key: string, fallback: boolean): boolean => {
  const raw = mmkvStorage.getString(key);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return fallback;
};

export const studioPrefs = {
  tipsSeen(): boolean {
    return studioPrefs.tipsSeenWhere() !== null;
  },
  /** Where the seen flag was found, for telemetry: local store, keychain, or null. */
  tipsSeenWhere(): 'local' | 'keychain' | null {
    if (mmkvStorage.getString(KEY_TIPS_SEEN) === '1') return 'local';
    if (keychainTipsSeen()) {
      mmkvStorage.setString(KEY_TIPS_SEEN, '1');
      return 'keychain';
    }
    return null;
  },
  setTipsSeen(seen: boolean): void {
    mmkvStorage.setString(KEY_TIPS_SEEN, seen ? '1' : '0');
    try {
      if (seen) SecureStore.setItem(KEYCHAIN_TIPS_SEEN, '1');
      else void SecureStore.deleteItemAsync(KEYCHAIN_TIPS_SEEN);
    } catch {
      // The local store still has it.
    }
  },
  previewSeconds(): 3 | 5 {
    return mmkvStorage.getNumber(KEY_PREVIEW_SECONDS) === 5 ? 5 : 3;
  },
  setPreviewSeconds(seconds: 3 | 5): void {
    mmkvStorage.setNumber(KEY_PREVIEW_SECONDS, seconds);
  },
  /** Ruler labels: minutes and seconds, or plain seconds. */
  timelineMarker(): TimelineMarker {
    return mmkvStorage.getString(KEY_TIMELINE_MARKER) === 'second'
      ? 'second'
      : 'timecode';
  },
  setTimelineMarker(marker: TimelineMarker): void {
    mmkvStorage.setString(KEY_TIMELINE_MARKER, marker);
  },
  /** Cuts the editor's own animations for people who find them distracting. */
  reduceAnimation(): boolean {
    return flag(KEY_REDUCE_ANIMATION, false);
  },
  setReduceAnimation(value: boolean): void {
    mmkvStorage.setString(KEY_REDUCE_ANIMATION, value ? '1' : '0');
  },
  /** Prefixes every track name with its position, like SoundLab does. */
  showTrackIndex(): boolean {
    return flag(KEY_SHOW_TRACK_INDEX, false);
  },
  setShowTrackIndex(value: boolean): void {
    mmkvStorage.setString(KEY_SHOW_TRACK_INDEX, value ? '1' : '0');
  },
  /** Whether a zoom keeps playback running or stops it. */
  keepPlayingOnZoom(): boolean {
    return flag(KEY_KEEP_PLAYING_ON_ZOOM, true);
  },
  setKeepPlayingOnZoom(value: boolean): void {
    mmkvStorage.setString(KEY_KEEP_PLAYING_ON_ZOOM, value ? '1' : '0');
  },
};
