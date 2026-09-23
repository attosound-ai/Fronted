import { useFeatureFlag } from '@/lib/analytics';
import { INCALL_EDITOR_AUTOLOAD_FLAG } from '@/hooks/useConnectedCallLanding';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useRecorderModeStore, type RecorderMode } from '@/stores/recorderModeStore';

/**
 * The recorder a call lands on: the user's choice when they made one, else
 * the app's own rule (pro for advanced_production with the editor flag, the
 * simple recorder otherwise). recording.tsx and the settings rows share it.
 */
export function useEffectiveRecorderMode(): RecorderMode {
  const chosen = useRecorderModeStore((s) => s.mode);
  const hasAdvancedProduction = useSubscriptionStore((s) =>
    s.hasEntitlement('advanced_production')
  );
  const editorFlagOn = useFeatureFlag(INCALL_EDITOR_AUTOLOAD_FLAG) === true;
  if (chosen) return chosen;
  return hasAdvancedProduction && editorFlagOn ? 'pro' : 'simple';
}
