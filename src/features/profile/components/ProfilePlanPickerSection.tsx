import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useFreePlanSwitching } from '@/hooks/usePaywall';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { paymentService } from '@/lib/api/paymentService';
import { haptic } from '@/lib/haptics/hapticService';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { ProfileSection } from './ProfileSection';

/**
 * Testing period plan picker: every account can move itself to any plan, no
 * payment, straight from its profile settings. One row per plan in the order
 * the admin set, a check on the current one, like a Settings list. The
 * server decides whether this exists at all (`freeSwitching` on the paywall
 * endpoint), so turning it off needs no app update.
 */
export function ProfilePlanPickerSection() {
  const { t } = useTranslation('profile');
  const enabled = useFreePlanSwitching();
  const queryClient = useQueryClient();
  const currentPlan = useSubscriptionStore((s) => s.getResolvedPlan());
  const [pending, setPending] = useState<string | null>(null);

  const { data: plans } = useQuery({
    queryKey: [...QUERY_KEYS.PAYWALL.CONFIG, 'plans'],
    queryFn: () => paymentService.getPlans(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled || !plans || plans.length === 0) return null;

  const pick = async (planId: string, planName: string) => {
    if (pending || planId === currentPlan) return;
    void haptic('selection');
    setPending(planId);
    const from = currentPlan;
    try {
      await paymentService.selectPlan(planId);
      await useSubscriptionStore.getState().fetchSubscription();
      // The new plan can add or remove the bridge number and every gated
      // surface; drop what was cached under the old plan.
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PAYMENTS.BRIDGE_NUMBER,
      });
      analytics.capture(ANALYTICS_EVENTS.PAYMENT.PLAN_PICKED, {
        from_plan: from,
        to_plan: planId,
        ok: true,
      });
      showToast(t('subscription.pickerChanged', { plan: planName }));
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      analytics.capture(ANALYTICS_EVENTS.PAYMENT.PLAN_PICKED, {
        from_plan: from,
        to_plan: planId,
        ok: false,
        http_status: status ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      showToast(t('subscription.pickerFailed'));
    } finally {
      setPending(null);
    }
  };

  return (
    <ProfileSection title={t('subscription.pickerTitle')}>
      <Text variant="caption" style={styles.note}>
        {t('subscription.pickerNote')}
      </Text>
      <View style={styles.group}>
        {plans.map((plan) => {
          const selected = plan.id === currentPlan;
          return (
            <Pressable
              key={plan.id}
              onPress={() => void pick(plan.id, plan.name)}
              disabled={pending !== null}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: pending !== null }}
              accessibilityLabel={plan.name}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.texts}>
                <Text variant="body" style={styles.name}>
                  {plan.name}
                </Text>
                <Text variant="caption" style={styles.price}>
                  {plan.price}
                </Text>
              </View>
              {pending === plan.id ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : selected ? (
                <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ProfileSection>
  );
}

const styles = StyleSheet.create({
  note: {
    color: '#888888',
    marginBottom: 10,
  },
  group: {
    borderRadius: 14,
    backgroundColor: '#141414',
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    backgroundColor: '#1F1F1F',
  },
  texts: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
  },
  price: {
    color: '#888888',
    marginTop: 2,
  },
});
