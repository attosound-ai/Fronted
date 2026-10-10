import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { injectCallAudioFault } from '@/lib/callAudio/engineHeal';

/**
 * TEST ONLY (Oct 10 2026): atto://atto-fault?mode=playback_movie|stop_unit breaks
 * the live call's audio on purpose so the voice engine's self heal can be proven
 * on a real phone. The native side refuses unless the `call_audio_fault_injection`
 * flag put the switch on for this phone (test accounts only), so for everyone else
 * this screen does nothing and goes straight back.
 */
export default function AttoFaultScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  useEffect(() => {
    const m = mode === 'stop_unit' ? 'stop_unit' : 'playback_movie';
    void injectCallAudioFault(m).finally(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });
  }, [mode]);

  return null;
}
