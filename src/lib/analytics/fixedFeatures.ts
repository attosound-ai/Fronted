/**
 * Features that are the SAME for every user (David, Oct 3 2026: "no me gusta
 * prender cosas para unos usuarios sí y otros no ... ningún usuario tenga
 * ningún error y puedan probar todo"). These keys no longer depend on PostHog:
 * the call features run for everyone, the experiment rolled back in August is
 * off for everyone. The native side matches (Twilio module and cold bootstrap
 * always install the engine; the render format recheck is always on).
 *
 * clip_effects_enabled is NOT here on purpose: it is a commercial gate that is
 * off for everyone and stays a remote switch.
 */
export const FIXED_FEATURES: Readonly<Record<string, boolean>> = {
  coldlaunch_callkit_enabled: true,
  audio_injection_enabled: true,
  call_playback_v2: true,
  call_playback_v2_timeline: true,
  call_playback_v2_video: true,
  incall_editor_autoload: true,
  incall_engine_mix_recording: true,
  engine_render_format_recheck: true,
  call_connect_session_sequencing: false,
};

export function fixedFeature(key: string): boolean | undefined {
  return Object.prototype.hasOwnProperty.call(FIXED_FEATURES, key)
    ? FIXED_FEATURES[key]
    : undefined;
}
