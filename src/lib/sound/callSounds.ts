import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * Short call-feedback sounds (DTMF key tones + the WhatsApp-style end-call
 * chime), played through pre-created expo-audio players.
 *
 * IMPORTANT — why this is call-safe (unlike react-native-audio-api, which is
 * banned because it seizes the AVAudioSession as exclusive `playback` and kills
 * the mic): we NEVER call setAudioModeAsync here. These players play into
 * whatever session is already active. During a Twilio call that session is
 * PlayAndRecord + `mixWithOthers` (see useTwilioVoice.reclaimAudioSession), so a
 * tone simply MIXES over the live call audio — it can't interrupt or duck it.
 *
 * Players are reused (one per sound) and just rewound (`seekTo(0)`) on each
 * trigger, so rapid keypad taps don't allocate. All failures are swallowed —
 * audio feedback is strictly non-critical UI polish.
 */

const DTMF_SOURCES: Record<string, number> = {
  '1': require('../../../assets/sounds/dtmf-1.m4a'),
  '2': require('../../../assets/sounds/dtmf-2.m4a'),
  '3': require('../../../assets/sounds/dtmf-3.m4a'),
  '4': require('../../../assets/sounds/dtmf-4.m4a'),
  '5': require('../../../assets/sounds/dtmf-5.m4a'),
  '6': require('../../../assets/sounds/dtmf-6.m4a'),
  '7': require('../../../assets/sounds/dtmf-7.m4a'),
  '8': require('../../../assets/sounds/dtmf-8.m4a'),
  '9': require('../../../assets/sounds/dtmf-9.m4a'),
  '0': require('../../../assets/sounds/dtmf-0.m4a'),
  '*': require('../../../assets/sounds/dtmf-star.m4a'),
  '#': require('../../../assets/sounds/dtmf-pound.m4a'),
};

const END_CALL_SOURCE = require('../../../assets/sounds/end-call.m4a');

let dtmfPlayers: Record<string, AudioPlayer> | null = null;
let endCallPlayer: AudioPlayer | null = null;

/**
 * Pre-create every player so the FIRST tap/hang-up is instant (no allocation on
 * the interaction). Idempotent — safe to call on every call connect / keypad open.
 */
export function preloadCallSounds(): void {
  if (dtmfPlayers) return;
  try {
    // keepAudioSessionActive: true is CRITICAL — without it the player would
    // deactivate the iOS audio session when the short tone ends, which would
    // interrupt a live Twilio call. Keeping it active means we only ever mix in.
    const opts = { keepAudioSessionActive: true } as const;
    const players: Record<string, AudioPlayer> = {};
    for (const key of Object.keys(DTMF_SOURCES)) {
      const p = createAudioPlayer(DTMF_SOURCES[key], opts);
      p.volume = 0.5;
      players[key] = p;
    }
    dtmfPlayers = players;
    endCallPlayer = createAudioPlayer(END_CALL_SOURCE, opts);
    endCallPlayer.volume = 0.85;
  } catch {
    // best-effort — sound is non-critical
  }
}

/** Play the dual-tone for a keypad digit ('0'-'9', '*', '#'). No-op if unknown. */
export function playDtmfTone(key: string): void {
  if (!dtmfPlayers) preloadCallSounds();
  const p = dtmfPlayers?.[key];
  if (!p) return;
  try {
    void p.seekTo(0);
    p.play();
  } catch {
    // noop
  }
}

/** Play the short descending end-call chime (call hang-up feedback). */
export function playEndCallSound(): void {
  if (!endCallPlayer) preloadCallSounds();
  if (!endCallPlayer) return;
  try {
    void endCallPlayer.seekTo(0);
    endCallPlayer.play();
  } catch {
    // noop
  }
}
