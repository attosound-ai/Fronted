/**
 * iMessage style message effects.
 *
 * A message carries its effect in `metadata.effect`. Bubble effects animate
 * the bubble itself when it arrives; screen effects take over the whole chat
 * for a moment. Everything here is pure (no React Native imports) so the
 * geometry can be unit tested.
 */

export const BUBBLE_EFFECTS = ['slam', 'loud', 'gentle', 'invisible'] as const;
export const SCREEN_EFFECTS = [
  'echo',
  'spotlight',
  'balloons',
  'confetti',
  'love',
  'lasers',
  'fireworks',
  'celebration',
] as const;

export type BubbleEffectName = (typeof BUBBLE_EFFECTS)[number];
export type ScreenEffectName = (typeof SCREEN_EFFECTS)[number];

export type MessageEffect =
  | { kind: 'bubble'; name: BubbleEffectName }
  | { kind: 'screen'; name: ScreenEffectName };

/** How long each effect runs, in milliseconds. */
export const EFFECT_DURATION_MS: Record<BubbleEffectName | ScreenEffectName, number> = {
  slam: 900,
  loud: 1100,
  gentle: 1100,
  // Invisible ink has no end: it waits for a tap.
  invisible: 0,
  echo: 2600,
  spotlight: 2400,
  balloons: 4200,
  confetti: 3600,
  love: 3000,
  lasers: 2800,
  fireworks: 3400,
  celebration: 3400,
};

/**
 * Read a validated effect off a message's metadata. Anything unknown reads
 * as "no effect" so a newer sender can never break an older client.
 */
export function effectFromMetadata(metadata: unknown): MessageEffect | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as { effect?: unknown }).effect;
  if (!raw || typeof raw !== 'object') return null;
  const kind = (raw as { kind?: unknown }).kind;
  const name = (raw as { name?: unknown }).name;
  if (typeof name !== 'string') return null;
  if (kind === 'bubble' && (BUBBLE_EFFECTS as readonly string[]).includes(name)) {
    return { kind: 'bubble', name: name as BubbleEffectName };
  }
  if (kind === 'screen' && (SCREEN_EFFECTS as readonly string[]).includes(name)) {
    return { kind: 'screen', name: name as ScreenEffectName };
  }
  return null;
}

/** Stable palette for the particles: the brand's gold and white, never blue. */
export const EFFECT_COLORS = ['#FCF6BA', '#E6C65A', '#D4AF37', '#BF953F', '#FFFFFF'];

export interface Particle {
  /** 0 to 1 of the screen width. */
  x: number;
  /** 0 to 1 of the screen height. */
  y: number;
  size: number;
  /** Milliseconds before it starts. */
  delay: number;
  duration: number;
  /** Degrees of spin over its life. */
  rotation: number;
  /** Sideways travel, in fractions of the screen width. */
  drift: number;
  color: string;
}

/** Deterministic pseudo random, so a given seed always draws the same burst. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Seed from a message id, so a replay looks like the first play. */
export function seedFromId(id: string): number {
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  return seed || 1;
}

export function confettiParticles(seed: number, count = 70): Particle[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: -0.1 - rand() * 0.3,
    size: 6 + rand() * 8,
    delay: rand() * 700,
    duration: 1800 + rand() * 1200,
    rotation: 180 + rand() * 540,
    drift: (rand() - 0.5) * 0.4,
    color: EFFECT_COLORS[Math.floor(rand() * EFFECT_COLORS.length)],
  }));
}

export function balloonParticles(seed: number, count = 18): Particle[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: 0.06 + ((i * 0.13 + rand() * 0.08) % 0.88),
    y: 1.1 + rand() * 0.3,
    size: 34 + rand() * 26,
    delay: rand() * 1200,
    duration: 2600 + rand() * 1400,
    rotation: (rand() - 0.5) * 20,
    drift: (rand() - 0.5) * 0.18,
    color: EFFECT_COLORS[Math.floor(rand() * EFFECT_COLORS.length)],
  }));
}

export function heartParticles(seed: number, count = 20): Particle[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, () => ({
    x: 0.3 + rand() * 0.4,
    y: 0.75 + rand() * 0.2,
    size: 22 + rand() * 40,
    delay: rand() * 900,
    duration: 1600 + rand() * 1000,
    rotation: (rand() - 0.5) * 30,
    drift: (rand() - 0.5) * 0.5,
    color: '#FF3B5C',
  }));
}

/** Lasers sweep as horizontal beams; `y` is where each one sits. */
export function laserBeams(seed: number, count = 14): Particle[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: i % 2 === 0 ? -0.2 : 1.2,
    y: 0.08 + (i / count) * 0.84 + (rand() - 0.5) * 0.03,
    size: 2 + rand() * 3,
    delay: rand() * 900,
    duration: 700 + rand() * 500,
    rotation: 0,
    drift: i % 2 === 0 ? 1.4 : -1.4,
    color: rand() > 0.5 ? '#FCF6BA' : '#FFFFFF',
  }));
}

export interface Burst {
  x: number;
  y: number;
  delay: number;
  color: string;
  /** Sparks flying out of this burst. */
  sparks: { angle: number; distance: number; size: number }[];
}

export function fireworkBursts(seed: number, count = 6, sparksPer = 14): Burst[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, () => ({
    x: 0.15 + rand() * 0.7,
    y: 0.15 + rand() * 0.5,
    delay: rand() * 1800,
    color: EFFECT_COLORS[Math.floor(rand() * EFFECT_COLORS.length)],
    sparks: Array.from({ length: sparksPer }, (_, s) => ({
      angle: (s / sparksPer) * 360 + rand() * 12,
      distance: 60 + rand() * 70,
      size: 3 + rand() * 4,
    })),
  }));
}

/** Celebration: gold plumes rising from the bottom edge. */
export function celebrationParticles(seed: number, count = 44): Particle[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, () => ({
    x: 0.5 + (rand() - 0.5) * 0.5,
    y: 1.05,
    size: 5 + rand() * 9,
    delay: rand() * 600,
    duration: 1500 + rand() * 1100,
    rotation: (rand() - 0.5) * 360,
    drift: (rand() - 0.5) * 0.9,
    color: EFFECT_COLORS[Math.floor(rand() * EFFECT_COLORS.length)],
  }));
}

/** Echo repeats the message across the screen; these are the copies. */
export function echoCopies(seed: number, count = 26): Particle[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: rand(),
    size: 0.6 + rand() * 0.9,
    delay: rand() * 1200,
    duration: 900 + rand() * 700,
    rotation: (rand() - 0.5) * 24,
    drift: 0,
    color: '#FFFFFF',
  }));
}

/**
 * A phone whose clock runs behind the server's sees a new message stamped in
 * the future. That is clock drift, not history: it still counts as new.
 */
const CLOCK_DRIFT_MS = 5 * 60_000;

/**
 * Whether a message is recent enough for its effect to play as it lands.
 * Older ones are history and stay quiet, the way iMessage never replays on
 * the way back into a conversation.
 */
export function isFreshForEffect(
  createdAt: unknown,
  now: number,
  freshMs: number
): boolean {
  const stamped =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === 'number'
        ? createdAt
        : createdAt
          ? Date.parse(String(createdAt))
          : NaN;
  if (Number.isNaN(stamped)) return false;
  const age = now - stamped;
  return age > -CLOCK_DRIFT_MS && age < freshMs;
}

/**
 * Every id one message goes by: its own and the client key it was sent with.
 * The sender's optimistic row and the server's copy of it share the client
 * key, so what one of them has played the other has played too.
 */
export function effectIdsOf(message: {
  messageId?: string | null;
  clientKey?: string | null;
}): string[] {
  const ids: string[] = [];
  for (const id of [message.messageId, message.clientKey]) {
    if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Where played effects are remembered (storage on the phone, a set in tests). */
export interface EffectMemory {
  has: (id: string) => boolean;
  mark: (id: string) => void;
}

/** Everything in the thread when the chat opens counts as already seen. */
export function seedPlayedEffects(
  messages: { messageId?: string | null; clientKey?: string | null }[],
  memory: EffectMemory
): void {
  for (const message of messages) {
    for (const id of effectIdsOf(message)) memory.mark(id);
  }
}

/**
 * The screen effect to start after a change in the thread, or null. A message
 * is marked under every id it goes by, so the sender's phone starts ONE effect
 * and not a second one when the server's copy replaces the optimistic row
 * (PostHog showed both, Oct 6 2026).
 */
export function nextScreenEffect(
  messages: {
    messageId: string;
    clientKey?: string | null;
    metadata?: unknown;
    createdAt?: unknown;
    content?: string | null;
  }[],
  memory: EffectMemory,
  now: number,
  freshMs: number
): { name: ScreenEffectName; messageId: string; text?: string } | null {
  for (const message of messages) {
    const effect = effectFromMetadata(message.metadata);
    if (!effect || effect.kind !== 'screen') continue;
    const ids = effectIdsOf(message);
    const seen = ids.some((id) => memory.has(id));
    for (const id of ids) memory.mark(id);
    if (seen) continue;
    if (!isFreshForEffect(message.createdAt, now, freshMs)) continue;
    return {
      name: effect.name,
      messageId: message.messageId,
      text: message.content ?? undefined,
    };
  }
  return null;
}

/**
 * Effects play once, when the message first shows up. A module level set is
 * enough: a fresh launch replaying an old effect is exactly what iMessage
 * does not do, and the set lives as long as the session.
 */
const played = new Set<string>();

export function hasEffectPlayed(messageId: string): boolean {
  return played.has(messageId);
}

export function markEffectPlayed(messageId: string): void {
  played.add(messageId);
}

export function forgetEffect(messageId: string): void {
  played.delete(messageId);
}

/** Only for tests. */
export function resetPlayedEffects(): void {
  played.clear();
}
