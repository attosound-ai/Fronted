import React, { useState } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { StepProps } from '@/types/registration';
import type { PlanId } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { paymentService } from '@/lib/api/paymentService';
import { getErrorMessage } from '@/utils/formatters';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  priceLabel: string;
  features: string[];
  popular?: boolean;
}[] = [
  {
    id: 'record',
    name: 'Record',
    price: 99,
    priceLabel: '$99/year',
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
    price: 139,
    priceLabel: '$139/year',
    popular: true,
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
    price: 1999,
    priceLabel: '$1,999/year',
    features: [
      'Talent analytics dashboard',
      'Top emerging creators',
      'Engagement & demographic insights',
      'Exportable data reports',
      'Early access to emerging talent',
    ],
  },
];

/**
 * Step 8: Subscription Plans
 * Presents 3 paid plan cards with Stripe Payment Sheet integration
 */
export const StepSubscription: React.FC<StepProps & { onSkip?: () => void }> = ({
  state,
  dispatch,
  onNext,
  onBack,
  onSkip,
  isLoading,
  apiError,
}) => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [activePlan, setActivePlan] = useState<PlanId | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>(null);

  const toggleExpand = (planId: PlanId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlan((prev) => (prev === planId ? null : planId));
  };

  const handleSubscribe = async (planId: PlanId) => {
    setIsProcessing(true);
    setActivePlan(planId);
    setPaymentError(null);

    try {
      const { clientSecret, paymentIntentId } = await paymentService.createCheckout(
        planId,
        state.email,
      );

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'ATTO Sound',
        style: 'alwaysDark',
        returnURL: 'atto://stripe-redirect',
      });

      if (initError) {
        setPaymentError(initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') return;
        setPaymentError(presentError.message);
        return;
      }

      setPaymentCompleted(true);
      dispatch({ type: 'UPDATE_FIELD', field: 'selectedPlan', value: planId });

      try {
        const result = await paymentService.confirmPayment(paymentIntentId);
        if (result.bridgeNumber) {
          dispatch({
            type: 'UPDATE_FIELD',
            field: 'bridgeNumber',
            value: result.bridgeNumber,
          });
        }
      } catch {
        // Stripe payment succeeded but server confirmation failed.
      }

      await onNext();
    } catch (error: unknown) {
      setPaymentError(getErrorMessage(error, 'Payment failed. Please try again.'));
    } finally {
      setIsProcessing(false);
      setActivePlan(null);
    }
  };

  const handleContinueWithout = () => {
    dispatch({ type: 'UPDATE_FIELD', field: 'selectedPlan', value: 'none' });
    if (onSkip) onSkip();
  };

  const busy = isLoading || isProcessing || paymentCompleted;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text variant="h1" style={styles.title}>
            Choose Your Plan
          </Text>
          <View style={styles.backButton} />
        </View>

        <Text style={styles.subtitle}>
          Unlock features that match your goals.
        </Text>

        {PLANS.map((plan) => {
          const isExpanded = expandedPlan === plan.id;

          return (
            <View
              key={plan.id}
              style={[styles.planCard, plan.popular && styles.planCardPopular]}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>MOST POPULAR</Text>
                </View>
              )}

              <View style={styles.planTop}>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={styles.priceContainer}>
                    <RNText style={styles.price} allowFontScaling={false}>
                      ${plan.price.toLocaleString()}
                    </RNText>
                    <RNText style={styles.priceUnit} allowFontScaling={false}>
                      /year
                    </RNText>
                  </View>
                </View>

                <Button
                  title={
                    paymentCompleted && activePlan === plan.id
                      ? 'Continue'
                      : 'Subscribe'
                  }
                  onPress={
                    paymentCompleted && activePlan === plan.id
                      ? () => onNext()
                      : () => handleSubscribe(plan.id)
                  }
                  disabled={busy && activePlan !== plan.id}
                  loading={isProcessing && activePlan === plan.id}
                  size="sm"
                />
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
                <View style={styles.featuresContainer}>
                  {plan.features.map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <Ionicons name="checkmark" size={16} color="#AAAAAA" />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {(paymentError || apiError) && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{paymentError || apiError}</Text>
          </View>
        )}

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimer}>
            Cancel anytime. Subscription renews automatically unless canceled before
            renewal.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleContinueWithout}
          style={styles.skipButton}
          disabled={busy}
        >
          <Text style={styles.skipText}>Continue without Subscription</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    marginBottom: 16,
  },
  planCardPopular: {
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    marginTop: 14,
    paddingTop: 8,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    left: '50%',
    transform: [{ translateX: -52 }],
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 1,
  },
  popularText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10,
    color: '#000000',
    letterSpacing: 0.5,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 0,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  price: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 22,
    lineHeight: 30,
    color: '#FFFFFF',
  },
  priceUnit: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#999999',
    marginLeft: 4,
  },
  featuresToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  featuresToggleText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: '#666',
  },
  featuresContainer: {
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#CCCCCC',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2D1515',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#EF4444',
  },
  disclaimerBox: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 24,
  },
  disclaimer: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#888888',
    textAlign: 'center',
  },
  skipButton: {
    alignSelf: 'center',
    padding: 12,
  },
  skipText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  bottomSpacer: {
    height: 20,
  },
});
