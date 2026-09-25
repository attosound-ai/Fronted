/**
 * Tagging people in a post, the way Instagram does it: you type @, a list of
 * people appears, you pick one, and the name you picked reads as a link that
 * opens their profile. The people picked ride with the post so the link still
 * works when someone else reads it, and so the server can tell them.
 *
 * Pure on purpose: the composer, the renderer and the tests all read the same
 * rules from here.
 */

/** Usernames are letters, digits, dot and underscore, the way the app mints them. */
const NAME = '[A-Za-z0-9._]';
/** A written mention inside a caption. */
export const MENTION_PATTERN = new RegExp(`@(${NAME}{1,30})`, 'g');
/** The token being typed, anchored to the end of what comes before the caret. */
const ACTIVE = new RegExp(`(^|[^${NAME.slice(1, -1)}@])@(${NAME}{0,30})$`);

export const MENTION_METADATA_IDS = 'taggedUserIds';
export const MENTION_METADATA_NAMES = 'taggedUsernames';

export interface TaggedPerson {
  id: string;
  username: string;
}

export interface ActiveMention {
  /** Index of the "@" in the text. */
  start: number;
  /** What has been typed after it, without the "@". */
  query: string;
}

/**
 * The mention being written at the caret, if any. Returns null once the token
 * is broken by a space, so the list closes when the thought moves on.
 */
export function activeMention(text: string, caret: number): ActiveMention | null {
  const before = text.slice(0, Math.max(0, caret));
  const match = ACTIVE.exec(before);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: before.length - query.length - 1, query };
}

/**
 * Put the chosen name in place of what was being typed, and leave the caret
 * after the space that follows it, so the next word starts clean.
 */
export function applyMention(
  text: string,
  active: ActiveMention,
  username: string
): { text: string; caret: number } {
  const head = text.slice(0, active.start);
  const tail = text.slice(active.start + 1 + active.query.length);
  const inserted = `@${username} `;
  const rest = tail.startsWith(' ') ? tail.slice(1) : tail;
  return { text: `${head}${inserted}${rest}`, caret: head.length + inserted.length };
}

/** Every username written in a caption, in order, without duplicates. */
export function mentionedUsernames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const name = match[1];
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Only the people who are still named in the caption get tagged. Deleting the
 * name deletes the tag, which is what Instagram does and what keeps a post
 * from notifying someone whose name the author took back out.
 */
export function survivingTags(text: string, picked: TaggedPerson[]): TaggedPerson[] {
  const written = new Set(mentionedUsernames(text).map((n) => n.toLowerCase()));
  return picked.filter((p) => written.has(p.username.toLowerCase()));
}

/** The two metadata entries a post carries for its tagged people. */
export function tagMetadata(tagged: TaggedPerson[]): Record<string, string> {
  if (tagged.length === 0) return {};
  return {
    [MENTION_METADATA_IDS]: tagged.map((p) => p.id).join(','),
    [MENTION_METADATA_NAMES]: tagged.map((p) => p.username).join(','),
  };
}

/**
 * username (lowercased) to user id, read back from a post's metadata, so a
 * tapped name goes straight to the right profile with no lookup.
 */
export function tagMapFrom(
  metadata: Record<string, string> | null | undefined
): Record<string, string> {
  const ids = (metadata?.[MENTION_METADATA_IDS] ?? '').split(',').filter(Boolean);
  const names = (metadata?.[MENTION_METADATA_NAMES] ?? '').split(',').filter(Boolean);
  const map: Record<string, string> = {};
  for (let i = 0; i < Math.min(ids.length, names.length); i += 1) {
    map[names[i].toLowerCase()] = ids[i];
  }
  return map;
}
