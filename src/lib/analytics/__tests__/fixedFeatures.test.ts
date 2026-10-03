import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_FEATURES, fixedFeature } from '../fixedFeatures';

// Every call feature is the same for every user (Oct 3 2026). If one of these
// ever goes back to a per user remote switch, this fails.
const CALL_FEATURES_ON = [
  'coldlaunch_callkit_enabled',
  'audio_injection_enabled',
  'call_playback_v2',
  'call_playback_v2_timeline',
  'call_playback_v2_video',
  'incall_editor_autoload',
  'incall_engine_mix_recording',
  'engine_render_format_recheck',
];

test('call features are fixed on for everyone', () => {
  for (const key of CALL_FEATURES_ON) assert.equal(fixedFeature(key), true, key);
});

test('the August experiment stays off for everyone', () => {
  assert.equal(fixedFeature('call_connect_session_sequencing'), false);
});

test('the commercial effects gate is still remote', () => {
  assert.equal(fixedFeature('clip_effects_enabled'), undefined);
  assert.equal('clip_effects_enabled' in FIXED_FEATURES, false);
});
