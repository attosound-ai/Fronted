/**
 * AnalyticsService — singleton wrapper around PostHog.
 *
 * The rest of the app imports `analytics` from this module and never
 * touches PostHog directly, keeping the coupling in one place.
 */

import type PostHog from 'posthog-react-native';
import * as Application from 'expo-application';
import { mmkvStorage } from '@/lib/storage/mmkv';
import type { User } from '@/types';

const ANALYTICS_OPT_OUT_KEY = 'analytics_opted_out';

class AnalyticsService {
  private posthog: PostHog | null = null;

  /** Called once by AnalyticsInitializer after the provider mounts. */
  setInstance(instance: PostHog) {
    this.posthog = instance;
  }

  // ── Identification ──────────────────────────────

  /** Identify user with ALL available person properties. */
  identify(user: User) {
    const phone =
      user.phoneCountryCode && user.phoneNumber
        ? `${user.phoneCountryCode}${user.phoneNumber}`
        : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostHog's JsonType is overly strict
    this.posthog?.identify(String(user.id), {
      $set: {
        email: user.email,
        name: user.displayName,
        username: user.username,
        phone: phone ?? null,
        avatar: user.avatar ?? null,
        role: user.role,
        registration_status: user.registrationStatus,
        profile_verified: user.profileVerified,
        followers_count: user.followersCount,
        following_count: user.followingCount,
        posts_count: user.postsCount,
        creator_name: user.creatorName ?? null,
        inmate_state: user.inmateState ?? null,
        relationship: user.relationship ?? null,
        consent_to_recording: user.consentToRecording ?? null,
      },
      $set_once: {
        created_at: user.createdAt,
        initial_role: user.role,
        first_seen_app_version: Application.nativeApplicationVersion ?? null,
      },
    } as any);

    // Super properties — attached to every future event automatically.
    this.posthog?.register({
      user_role: user.role,
      registration_status: user.registrationStatus,
      profile_verified: user.profileVerified,
      app_version: Application.nativeApplicationVersion,
    });

    // Group analytics — segment dashboards by role.
    this.posthog?.group('user_role', user.role, { role: user.role });
  }

  /** Reset on logout — clears distinct ID and super properties. */
  reset() {
    this.posthog?.reset();
  }

  // ── Event capture ───────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  capture(event: string, properties?: Record<string, any>) {
    this.posthog?.capture(event, properties);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screen(name: string, properties?: Record<string, any>) {
    this.posthog?.screen(name, properties);
  }

  // ── Group analytics ─────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  group(type: string, key: string, properties?: Record<string, any>) {
    this.posthog?.group(type, key, properties);
  }

  // ── Feature flags ───────────────────────────────

  isFeatureEnabled(key: string): boolean | undefined {
    return this.posthog?.isFeatureEnabled(key);
  }

  getFeatureFlag(key: string) {
    return this.posthog?.getFeatureFlag(key);
  }

  reloadFeatureFlags() {
    return this.posthog?.reloadFeatureFlagsAsync();
  }

  // ── Error tracking ──────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  captureError(error: unknown, context?: Record<string, any>) {
    if (error instanceof Error) {
      this.posthog?.capture('$exception', {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack ?? null,
        ...context,
      });
    }
  }

  // ── Privacy / consent ──────────────────────────

  /** Opt the user out of all analytics tracking. */
  optOut() {
    mmkvStorage.setString(ANALYTICS_OPT_OUT_KEY, 'true');
    this.posthog?.optOut();
  }

  /** Re-enable tracking after opt-out. */
  optIn() {
    mmkvStorage.setString(ANALYTICS_OPT_OUT_KEY, 'false');
    this.posthog?.optIn();
  }

  /** Check if user has opted out (synchronous, reads from local storage). */
  hasOptedOut(): boolean {
    return mmkvStorage.getString(ANALYTICS_OPT_OUT_KEY) === 'true';
  }
}

export const analytics = new AnalyticsService();
