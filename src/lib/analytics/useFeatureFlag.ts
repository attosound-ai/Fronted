/**
 * Re-export PostHog's useFeatureFlag hook so consumers import from
 * `@/lib/analytics` instead of coupling directly to the SDK.
 */
export { useFeatureFlag } from 'posthog-react-native';
