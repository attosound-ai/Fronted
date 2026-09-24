import { useState } from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/components/ui/Toast';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { paymentService } from '@/lib/api/paymentService';
import { haptic } from '@/lib/haptics/hapticService';
import { useFreePlanSwitching } from '@/hooks/usePaywall';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  ChoiceList,
  FooterText,
  Section,
  SettingsForm,
} from '@/features/settings/native';

/** Testing period plan picker, the native version of ProfilePlanPickerSection. */
export default function PlanSettingsScreen() {
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

  const pick = async (planId: string) => {
    if (pending || planId === currentPlan) return;
    const plan = plans?.find((p) => p.id === planId);
    void haptic('selection');
    setPending(planId);
    const from = currentPlan;
    try {
      await paymentService.selectPlan(planId);
      await useSubscriptionStore.getState().fetchSubscription();
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PAYMENTS.BRIDGE_NUMBER,
      });
      analytics.capture(ANALYTICS_EVENTS.PAYMENT.PLAN_PICKED, {
        from_plan: from,
        to_plan: planId,
        ok: true,
        surface: 'native_settings',
      });
      showToast(t('subscription.pickerChanged', { plan: plan?.name ?? planId }));
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      analytics.capture(ANALYTICS_EVENTS.PAYMENT.PLAN_PICKED, {
        from_plan: from,
        to_plan: planId,
        ok: false,
        http_status: status ?? null,
        error: error instanceof Error ? error.message : String(error),
        surface: 'native_settings',
      });
      showToast(t('subscription.pickerFailed'));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('subscription.pickerTitle') }} />
      <SettingsForm>
        <Section
          title={t('subscription.pickerTitle')}
          footer={<FooterText>{t('subscription.pickerNote')}</FooterText>}
        >
          <ChoiceList
            selection={currentPlan ?? ''}
            options={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))}
            onChange={(id) => void pick(id)}
          />
        </Section>
      </SettingsForm>
    </>
  );
}
