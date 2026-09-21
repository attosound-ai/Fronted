import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Which effects have already played on this device. iMessage plays an effect
 * once, when the message arrives, and never again: entering the chat a second
 * time must be quiet. A session only set was not enough, since every launch
 * (and every reload in development) replayed the whole history, so the set
 * lives in storage.
 */
const KEY = 'messages.effects.played.v1';
/** Old ids fall off the end: the newest ones are the ones that matter. */
const LIMIT = 800;

let ids: string[] | null = null;
let index: Set<string> | null = null;

function load(): Set<string> {
  if (index) return index;
  try {
    const raw = mmkvStorage.getString(KEY);
    ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    ids = [];
  }
  if (!Array.isArray(ids)) ids = [];
  index = new Set(ids);
  return index;
}

function save(): void {
  try {
    mmkvStorage.setString(KEY, JSON.stringify(ids ?? []));
  } catch {
    // Storage is best effort: a failed write only means an effect could
    // play once more, never a crash.
  }
}

export function hasEffectPlayed(messageId: string): boolean {
  return load().has(messageId);
}

export function markEffectPlayed(messageId: string): void {
  const set = load();
  if (set.has(messageId)) return;
  set.add(messageId);
  ids = [...(ids ?? []), messageId];
  if (ids.length > LIMIT) {
    const dropped = ids.slice(0, ids.length - LIMIT);
    ids = ids.slice(ids.length - LIMIT);
    for (const id of dropped) set.delete(id);
  }
  save();
}

/** Replay asked for by the person: the effect may play again. */
export function forgetEffect(messageId: string): void {
  const set = load();
  if (!set.delete(messageId)) return;
  ids = (ids ?? []).filter((id) => id !== messageId);
  save();
}
