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
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import { paymentService } from '@/lib/api/paymentService';
import type { PlanId } from '@/types/registration';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const PLANS: {
  id: PlanId;
  name: string;
  price: string;
  priceAmount: number;
  features: string[];
}[] = [
  {
    id: 'connect_free',
    name: 'Connect',
    price: 'Free',
    priceAmount: 0,
    features: [
      'Search and discover creators',
      'Listen to recordings',
      'Comment and engage with content',
      'Community browsing',
    ],
  },
  {
    id: 'record',
    name: 'Record',
    price: '$99/year',
    priceAmount: 99,
    features: [
      'Record and upload content',
      'Create a profile',
      'Community engagement',
      'Bridge phone number',
    ],
  },
  {
    id: 'record_pro',
    name: 'Record Pro',
    price: '$139/year',
    priceAmount: 139,
    features: [
      'Advanced production suite',
      'AI avatar videos (4-10 sec)',
      'Unlimited recordings',
      'Enhanced analytics',
      'Priority discovery algorithm',
    ],
  },
  {
    id: 'connect_pro',
    name: 'Connect Pro',
    price: '$1,999/year',
    priceAmount: 1999,
    features: [
      'Talent analytics dashboard',
      'Top emerging creators',
      'Engagement & demographic insights',
      'Exportable data reports',
      'Early access to emerging talent',
    ],
  },
];

const PLAN_ORDER: Record<PlanId, number> = {
  connect_free: 0,
  record: 1,
  record_pro: 2,
  connect_pro: 3,
};

export default function SubscriptionScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const currentPlan = useSubscriptionStore((s) => s.getPlan());
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const user = useAuthStore((s) => s.user);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePlan, setActivePlan] = useState<PlanId | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>(null);

  const toggleExpand = (planId: PlanId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlan((prev) => (prev === planId ? null : planId));
  };

  const handleUpgrade = async (planId: PlanId) => {
    if (!user?.email) return;
    setIsProcessing(true);
    setActivePlan(planId);

    try {
      const { clientSecret, paymentIntentId } = await paymentService.upgradeSubscription(
        planId,
        user.email,
      );

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'ATTO Sound',
        style: 'alwaysDark',
        returnURL: 'atto://stripe-redirect',
      });

      if (initError) {
        Alert.alert('Error', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Error', presentError.message);
        }
        return;
      }

      await paymentService.confirmPayment(paymentIntentId).catch(() => {});
      await fetchSubscription();
      Alert.alert('Success', 'Your subscription has been upgraded!');
    } catch {
      Alert.alert('Error', 'Failed to process upgrade. Please try again.');
    } finally {
      setIsProcessing(false);
      setActivePlan(null);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure? You will lose access to premium features at the end of your billing period.',
      [
        { text: 'Keep Plan', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentService.cancelSubscription();
              await fetchSubscription();
              Alert.alert('Cancelled', 'Your subscription has been cancelled.');
            } catch {
              Alert.alert('Error', 'Failed to cancel. Please try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text variant="h3" style={styles.headerTitle}>
          Subscription
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = PLAN_ORDER[plan.id] > PLAN_ORDER[currentPlan];
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

                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Current plan</Text>
                  </View>
                )}

                {isUpgrade && (
                  <Button
                    title="Upgrade"
                    onPress={() => handleUpgrade(plan.id)}
                    loading={isProcessing && activePlan === plan.id}
                    disabled={isProcessing && activePlan !== plan.id}
                    size="sm"
                  />
                )}

                {isCurrent && plan.id !== 'connect_free' && (
                  <TouchableOpacity onPress={handleCancel}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                onPress={() => toggleExpand(plan.id)}
                activeOpacity={0.7}
                style={styles.featuresToggle}
              >
                <Text style={styles.featuresToggleText}>
                  {isExpanded ? 'Hide features' : 'See features'}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#666"
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expandedContent}>
                  <View style={styles.features}>
                    {plan.features.map((f, i) => (
                      <View key={i} style={styles.featureRow}>
                        <Ionicons name="checkmark" size={14} color="#888" />
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 17,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: '#FFF',
  },
  planPrice: {
    fontFamily: 'Poppins_400Regular',
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
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  featuresToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featuresToggleText: {
    fontFamily: 'Poppins_400Regular',
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
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#CCC',
    flex: 1,
  },
  cancelText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#EF4444',
    textDecorationLine: 'underline',
  },
});
