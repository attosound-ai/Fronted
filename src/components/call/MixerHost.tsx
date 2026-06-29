import { useEffect, useRef } from 'react';
import { useMixerStore } from '@/stores/mixerStore';
import { useCallStore } from '@/stores/callStore';
import { MixerSheet } from './MixerSheet';

/** Open the in-call mixer sheet from anywhere (e.g. the InCallTopBar button). */
export function openMixer(): void {
  useMixerStore.getState().showMixer();
}

/**
 * MixerHost — single global host that renders the MixerSheet for every call
 * surface (mirrors DtmfKeypadHost). Mounted once at the root; store-driven. Also
 * resets the mixer when the call ends so it never carries record state across calls.
 */
export function MixerHost() {
  const visible = useMixerStore((s) => s.mixerVisible);
  const hideMixer = useMixerStore((s) => s.hideMixer);
  const resetMixer = useMixerStore((s) => s.resetMixer);
  const activeCallSid = useCallStore((s) => s.activeCall?.callSid ?? null);

  const prevSidRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSidRef.current;
    prevSidRef.current = activeCallSid;
    if (prev && !activeCallSid) resetMixer();
  }, [activeCallSid, resetMixer]);

  return <MixerSheet visible={visible} onClose={hideMixer} />;
}
