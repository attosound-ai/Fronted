import { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { ChevronDown, ChevronUp, Check, Clock, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import { paymentService } from '@/lib/api/paymentService';
import type { PlanChangePreview, PlanId } from '@/types';
import { PlanChangeBottomSheet } from '@/features/profile/components/PlanChangeBottomSheet';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const PLAN_ORDER: Record<PlanId, number> = {
  connect_free: 0,
  record: 1,
  record_pro: 2,
  connect_pro: 3,
};

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation('subscription');

  const PLANS: {
    id: PlanId;
    name: string;
    price: string;
    features: string[];
  }[] = [
    {
      id: 'connect_free',
      name: t('plans.connect_free.name'),
      price: t('plans.connect_free.price'),
      features: t('plans.connect_free.features', { returnObjects: true }) as string[],
    },
    {
      id: 'record',
      name: t('plans.record.name'),
      price: t('plans.record.price'),
      features: t('plans.record.features', { returnObjects: true }) as string[],
    },
    {
      id: 'record_pro',
      name: t('plans.record_pro.name'),
      price: t('plans.record_pro.price'),
      features: t('plans.record_pro.features', { returnObjects: true }) as string[],
    },
  ];

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const currentPlan = useSubscriptionStore((s) => s.getPlan());
  const pendingChange = useSubscriptionStore((s) => s.subscription?.pendingChange ?? null);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const user = useAuthStore((s) => s.user);
  const isCreator = user?.role === 'creator' && !!user?.inmateNumber;

  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<PlanId | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>(null);

  const toggleExpand = (planId: PlanId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlan((prev) => (prev === planId ? null : planId));
  };

  const labelFor = (id: PlanId) => PLANS.find((p) => p.id === id)?.name ?? id;

  const handleConfirm = async (preview: PlanChangePreview) => {
    if (!sheetTarget) return;
    setIsProcessing(true);
    try {
      const result = await paymentService.startPlanChange(sheetTarget, user?.email ?? '');

      if (result.kind === 'downgrade_scheduled' || result.kind === 'upgrade_free') {
        await fetchSubscription();
        setSheetTarget(null);
        Alert.alert(
          t('successTitle'),
          result.kind === 'downgrade_scheduled'
            ? t('changeSheet.downgradeScheduled', {
                defaultValue: "We'll switch you to {{plan}} on {{date}}.",
                plan: labelFor(sheetTarget),
                date: new Date(result.appliesAt).toLocaleDateString(i18n.language),
              })
            : t('successUpgrade')
        );
        return;
      }

      // result.kind === 'upgrade' → present Stripe sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: result.clientSecret,
        merchantDisplayName: t('merchantName'),
        style: 'alwaysDark',
        returnURL: 'atto://stripe-redirect',
      });
      if (initError) {
        Alert.alert(t('errorTitle'), initError.message);
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert(t('errorTitle'), presentError.message);
        }
        return;
      }
      await paymentService.confirmPlanChange(sheetTarget, result.paymentIntentId).catch(() => {});
      await fetchSubscription();
      setSheetTarget(null);
      Alert.alert(t('successTitle'), t('successUpgrade'));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (err instanceof Error ? err.message : null) ??
        t('errorUpgradeFailed');
      Alert.alert(t('errorTitle'), message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelPending = () => {
    Alert.alert(
      t('cancelPendingDialog.title', { defaultValue: 'Cancel scheduled change?' }),
      t('cancelPendingDialog.message', {
        defaultValue: "You'll keep your current plan and won't be switched.",
      }),
      [
        { text: t('cancelPendingDialog.keepScheduled', { defaultValue: 'Keep' }), style: 'cancel' },
        {
          text: t('cancelPendingDialog.confirm', { defaultValue: 'Cancel scheduled' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentService.cancelPendingChange();
              await fetchSubscription();
            } catch {
              Alert.alert(t('errorTitle'), t('errorCancelFailed'));
            }
          },
        },
      ]
    );
  };

  const handleCancelSubscription = () => {
    Alert.alert(t('cancelDialog.title'), t('cancelDialog.message'), [
      { text: t('cancelDialog.keepPlan'), style: 'cancel' },
      {
        text: t('cancelDialog.confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await paymentService.cancelSubscription();
            await fetchSubscription();
            Alert.alert(t('successTitle'), t('successCancelled'));
          } catch {
            Alert.alert(t('errorTitle'), t('errorCancelFailed'));
          }
        },
      },
    ]);
  };

  const renderPlanAction = (planId: PlanId, isCurrent: boolean) => {
    if (isCurrent) {
      return (
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>{t('currentPlanBadge')}</Text>
        </View>
      );
    }
    if (pendingChange?.targetPlan === planId) {
      return (
        <View style={styles.scheduledBadge}>
          <Text style={styles.scheduledBadgeText}>
            {t('scheduledBadge', { defaultValue: 'Scheduled' })}
          </Text>
        </View>
      );
    }
    const isUpgrade = PLAN_ORDER[planId] > PLAN_ORDER[currentPlan];
    return (
      <Button
        title={isUpgrade ? t('upgradeButton') : t('downgradeButton', { defaultValue: 'Downgrade' })}
        onPress={() => setSheetTarget(planId)}
        disabled={isProcessing || pendingChange != null}
        size="sm"
      />
    );
  };

  if (!isCreator) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={26} color="#FFFFFF" strokeWidth={2.25} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('title', { defaultValue: 'Subscription' })}</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            {t('creatorOnly.title', {
              defaultValue: 'Subscriptions are for creators only',
            })}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('creatorOnly.subtitle', {
              defaultValue:
                'Listening, browsing and messaging are free. Subscription plans are reserved for creator accounts (artists with a registered inmate number).',
            })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={26} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title', { defaultValue: 'Subscription' })}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {pendingChange && (
          <View style={styles.pendingBanner}>
            <Clock size={16} color="#F59E0B" strokeWidth={2.25} />
            <View style={styles.pendingTextWrap}>
              <Text style={styles.pendingTitle}>
                {t('pendingBanner.title', {
                  defaultValue: 'Scheduled: switching to {{plan}}',
                  plan: labelFor(pendingChange.targetPlan),
                })}
              </Text>
              <Text style={styles.pendingDate}>
                {t('pendingBanner.applies', {
                  defaultValue: 'On {{date}}',
                  date: new Date(pendingChange.appliesAt).toLocaleDateString(i18n.language),
                })}
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancelPending}>
              <Text style={styles.pendingCancel}>
                {t('pendingBanner.cancel', { defaultValue: 'Cancel' })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isExpanded = expandedPlan === plan.id;
          return (
            <View
              key={plan.id}
              style={[styles.planCard, isCurrent && styles.planCardCurrent]}
            >
              <View style={styles.planHeader}>
                <View style={styles.planHeaderLeft}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                </View>
                {renderPlanAction(plan.id, isCurrent)}
              </View>

              {isCurrent && plan.id !== 'connect_free' && (
                <TouchableOpacity onPress={handleCancelSubscription} style={styles.cancelRow}>
                  <Text style={styles.cancelText}>{t('cancelButton')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => toggleExpand(plan.id)}
                activeOpacity={0.7}
                style={styles.featuresToggle}
              >
                <Text style={styles.featuresToggleText}>
                  {isExpanded ? t('featuresHide') : t('featuresShow')}
                </Text>
                {isExpanded ? (
                  <ChevronUp size={14} color="#666" strokeWidth={2.25} />
                ) : (
                  <ChevronDown size={14} color="#666" strokeWidth={2.25} />
                )}
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expandedContent}>
                  <View style={styles.features}>
                    {plan.features.map((f, i) => (
                      <View key={i} style={styles.featureRow}>
                        <Check size={14} color="#888" strokeWidth={2.25} />
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>

      <PlanChangeBottomSheet
        visible={sheetTarget !== null}
        targetPlan={sheetTarget}
        planLabel={sheetTarget ? labelFor(sheetTarget) : ''}
        onClose={() => setSheetTarget(null)}
        onConfirm={handleConfirm}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#999',
    textAlign: 'center',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1F1505',
    borderColor: '#92400E',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  pendingTextWrap: {
    flex: 1,
  },
  pendingTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    color: '#FCD34D',
  },
  pendingDate: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#D6BB6F',
    marginTop: 2,
  },
  pendingCancel: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    color: '#FCD34D',
    textDecorationLine: 'underline',
  },
  scheduledBadge: {
    backgroundColor: '#1F1505',
    borderColor: '#92400E',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scheduledBadgeText: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    color: '#FCD34D',
  },
  planCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
  },
  planCardCurrent: {
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 0,
  },
  planHeaderLeft: {
    flex: 1,
  },
  planName: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 16,
    color: '#FFF',
  },
  planPrice: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  currentBadge: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  currentBadgeText: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  cancelRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  featuresToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featuresToggleText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#666',
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  features: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#CCC',
    flex: 1,
  },
  cancelText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#EF4444',
    textDecorationLine: 'underline',
  },
});
