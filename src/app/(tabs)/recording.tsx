import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallStore } from '@/stores/callStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useMountEffect } from '@/hooks';
import { useFeatureFlag } from '@/lib/analytics';
import { INCALL_EDITOR_AUTOLOAD_FLAG } from '@/hooks/useConnectedCallLanding';
import { ActiveCallScreen } from '@/components/call/ActiveCallScreen';
import { SimpleRecordingScreen } from '@/components/call/SimpleRecordingScreen';
import { useRecorderModeStore } from '@/stores/recorderModeStore';

export default function RecordingScreen() {
  const recordState = useSubscriptionStore((s) => s.entitlementState('record_upload'));
  const hasAdvancedProduction = useSubscriptionStore((s) =>
    s.hasEntitlement('advanced_production')
  );
  const editorFlagOn = useFeatureFlag(INCALL_EDITOR_AUTOLOAD_FLAG) === true;
  const recorderMode = useRecorderModeStore((s) => s.mode);
  // Set by the project picker: the user chose a project on purpose, so the
  // editor opens with it instead of the plain recorder.
  const { editor } = useLocalSearchParams<{ editor?: string }>();
  const editorRequested = editor === '1';

  // Redirect away ONLY once we're certain the user is NOT record-capable
  // (entitlementState === false). While it's still unknown (null — store not
  // hydrated / mid-fetch on a cold-launch or background CallKit answer) we STAY,
  // matching the /call hand-off that optimistically lands the rep here so an
  // answered-from-outside-the-app call always reaches record. This effect re-runs
  // as the entitlement resolves, so a genuinely-free user is bounced the instant
  // their plan is known — no premature bounce on the transient-null window.
  useEffect(() => {
    if (recordState === false) {
      router.replace('/(tabs)');
    }
  }, [recordState]);

  useMountEffect(() => {
    let hadCall = !!useCallStore.getState().activeCall;

    const unsubscribe = useCallStore.subscribe((state, prev) => {
      if (state.activeCall) hadCall = true;
      if (hadCall && prev.activeCall && !state.activeCall) {
        router.replace('/(tabs)');
      }
    });

    return unsubscribe;
  });

  const handleBack = () => {
    router.replace('/(tabs)');
  };

  // A call always lands on the recorder everyone knows: call controls on top,
  // the red record button at the bottom. The in call editor only takes over
  // for the cohort that has its flag on. Without the flag ActiveCallScreen
  // showed a bare "On call" placeholder, and once the free plan was granted
  // advanced_production every new creator landed on it (Sep 20 2026).
  // Profile > Settings > Recorder (David, Sep 23 2026) overrides the rule:
  // 'simple' always lands on the plain recorder, 'pro' always on the editor.
  if (recorderMode === 'simple' && !editorRequested) {
    return <SimpleRecordingScreen onBack={handleBack} />;
  }
  if (
    recorderMode === 'pro' ||
    (hasAdvancedProduction && (editorFlagOn || editorRequested))
  ) {
    return <ActiveCallScreen onBack={handleBack} openEditor={editorRequested} />;
  }

  return <SimpleRecordingScreen onBack={handleBack} />;
}
