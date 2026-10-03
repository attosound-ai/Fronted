import { useFeatureFlag as usePostHogFeatureFlag } from 'posthog-react-native';
import { fixedFeature } from './fixedFeatures';

/**
 * PostHog's useFeatureFlag, except for the keys fixed for everyone in
 * fixedFeatures.ts, which always return their fixed value.
 */
export function useFeatureFlag(key: string): ReturnType<typeof usePostHogFeatureFlag> {
  const remote = usePostHogFeatureFlag(key);
  const fixed = fixedFeature(key);
  return fixed === undefined ? remote : fixed;
}
