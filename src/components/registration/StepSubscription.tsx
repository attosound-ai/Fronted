import React, { useState } from 'react';
import {
  View,
  Text as RNText,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  UIManager,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useStripe } from '@stripe/stripe-react-native';
import { ChevronDown, ChevronUp, Check, AlertCircle, Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StepProps } from '@/types/registration';
import type { PlanId } from '@/types/registration';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { paymentService } from '@/lib/api/paymentService';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { getErrorMessage } from '@/utils/formatters';
import { haptic } from '@/lib/haptics/hapticService';
import { COLORS } from '@/constants/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const PLANS: {
  id: PlanId;
  price: number;
  priceLabel: string;
  popular?: boolean;
}[] = [
  {
    id: 'record',
    price: 99,
    priceLabel: '$99/year',
  },
  {
    id: 'record_pro',
    price: 139,
    priceLabel: '$139/year',
    popular: true,
  },
];

// Angle translation keys (shared between the card list and the PDF export).
const AVATAR_ANGLE_KEYS = [
  'subscription.avatar.angles.front',
  'subscription.avatar.angles.left45',
  'subscription.avatar.angles.right45',
  'subscription.avatar.angles.fullLeft',
  'subscription.avatar.angles.fullRight',
  'subscription.avatar.angles.slightDown',
  'subscription.avatar.angles.slightUp',
] as const;

// Pricing data for the value packs. `count === 1` renders the "Single" label,
// otherwise the pluralised "{{count}} messages" label.
const AVATAR_PACK_PRICES = [
  { count: 1, price: '$5', perClip: '$5/clip' },
  { count: 5, price: '$20', perClip: '$4/clip' },
  { count: 10, price: '$35', perClip: '$3.50/clip' },
  { count: 15, price: '$48', perClip: '$3.20/clip' },
  { count: 20, price: '$60', perClip: '$3/clip' },
];

// ─── Avatar Card ──────────────────────────────────────────────────────────────

function AvatarCard() {
  const { t } = useTranslation(['registration', 'common']);
  const [expanded, setExpanded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const avatarAngles = AVATAR_ANGLE_KEYS.map((key) => t(key));
  const avatarPacks = AVATAR_PACK_PRICES.map((pack) => ({
    label:
      pack.count === 1
        ? t('subscription.avatar.packs.single')
        : t('subscription.avatar.packs.messages', { count: pack.count }),
    price: pack.price,
    perClip: pack.perClip,
  }));

  const toggle = () => {
    // LayoutAnimation removed — crashes on RN 0.81.5 New Architecture
    setExpanded((v) => !v);
  };

  const buildInstructionsHtml = () => {
    const anglesHtml = avatarAngles.map((angle) => `    <li>${angle}</li>`).join('\n');
    const packsHtml = avatarPacks
      .map(
        (pack) =>
          `    <tr><td>${pack.label}</td><td>${pack.price}</td><td>${pack.perClip}</td></tr>`
      )
      .join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 32px; max-width: 600px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 28px; }
    h2 { font-size: 15px; margin: 24px 0 6px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    p, li { font-size: 13px; line-height: 1.6; color: #333; }
    ul { padding-left: 20px; margin: 6px 0; }
    .address { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; font-size: 13px; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; font-size: 12px; color: #888; padding: 6px 8px; border-bottom: 1px solid #ddd; }
    td { font-size: 13px; padding: 8px; border-bottom: 1px solid #eee; }
    .tip { font-style: italic; color: #888; font-size: 12px; margin-top: 20px; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <h1>${t('subscription.avatar.pdf.title')}</h1>
  <p class="subtitle">${t('subscription.avatar.pdf.subtitle')}</p>
  <h2>${t('subscription.avatar.pdf.step1Heading')}</h2>
  <p><strong>${t('subscription.avatar.pdf.rulesLabel')}</strong></p>
  <ul>
    <li>${t('subscription.avatar.pdf.rule1')}</li>
    <li>${t('subscription.avatar.pdf.rule2')}</li>
    <li>${t('subscription.avatar.pdf.rule3')}</li>
    <li>${t('subscription.avatar.pdf.rule4')}</li>
    <li>${t('subscription.avatar.pdf.rule5')}</li>
  </ul>
  <p><strong>${t('subscription.avatar.pdf.requiredAngles')}</strong></p>
  <ul>
${anglesHtml}
  </ul>
  <h2>${t('subscription.avatar.pdf.step2Heading')}</h2>
  <div class="address">ATTO<br/>1245 Farmington Ave., PMB 1368<br/>West Hartford, Connecticut 06107</div>
  <p>${t('subscription.avatar.pdf.step2Body')}</p>
  <h2>${t('subscription.avatar.pdf.step3Heading')}</h2>
  <p>${t('subscription.avatar.pdf.step3Body')}</p>
  <h2>${t('subscription.avatar.valuePacks')}</h2>
  <table>
    <tr><th>Pack</th><th>Price</th><th>Per clip</th></tr>
${packsHtml}
  </table>
  <p class="tip">${t('subscription.avatar.tip')}</p>
  <div class="footer">ATTO Sound · attosound.com</div>
</body>
</html>`;
  };

  const handleSharePDF = async () => {
    setIsSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          t('subscription.avatar.shareNotSupportedTitle'),
          t('subscription.avatar.shareNotSupportedMessage')
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({
        html: buildInstructionsHtml(),
        base64: false,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('subscription.avatar.shareDialogTitle'),
        UTI: 'com.adobe.pdf',
      });
    } catch (err) {
      Alert.alert(t('common:errors.title'), t('subscription.avatar.pdfError'));
      console.error('[SharePDF]', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={avatarStyles.card}>
      {/* Floating badge */}
      <View style={avatarStyles.floatingBadge}>
        <Text style={avatarStyles.floatingBadgeText}>{t('subscription.avatar.badgeNew')}</Text>
      </View>

      {/* Header row */}
      <View style={avatarStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={avatarStyles.title}>ATTO Avatar</Text>
        </View>
      </View>

      {/* Expandable instructions */}
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={avatarStyles.toggle}>
        <Text style={avatarStyles.toggleText}>
          {expanded
            ? t('subscription.avatar.hideInstructions')
            : t('subscription.avatar.howItWorks')}
        </Text>
        {expanded ? (
          <ChevronUp size={14} color="#666" strokeWidth={2.25} />
        ) : (
          <ChevronDown size={14} color="#666" strokeWidth={2.25} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={avatarStyles.body}>
          {/* Step 1 */}
          <View style={avatarStyles.step}>
            <View style={avatarStyles.stepNum}>
              <Text style={avatarStyles.stepNumText}>1</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={avatarStyles.stepTitle}>{t('subscription.avatar.step1Title')}</Text>
              <Text style={avatarStyles.stepNote}>
                {t('subscription.avatar.step1Note')}
              </Text>
              <View style={avatarStyles.angleList}>
                {avatarAngles.map((angle) => (
                  <View key={angle} style={avatarStyles.angleRow}>
                    <View style={avatarStyles.dot} />
                    <Text style={avatarStyles.angleText}>{angle}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={avatarStyles.divider} />

          {/* Step 2 */}
          <View style={avatarStyles.step}>
            <View style={avatarStyles.stepNum}>
              <Text style={avatarStyles.stepNumText}>2</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={avatarStyles.stepTitle}>{t('subscription.avatar.step2Title')}</Text>
              <Text style={avatarStyles.address}>
                ATTO{'\n'}
                1245 Farmington Ave., PMB 1368{'\n'}
                West Hartford, CT 06107
              </Text>
              <Text style={avatarStyles.stepNote}>
                {t('subscription.avatar.step2Note')}
              </Text>
            </View>
          </View>

          <View style={avatarStyles.divider} />

          {/* Step 3 */}
          <View style={avatarStyles.step}>
            <View style={avatarStyles.stepNum}>
              <Text style={avatarStyles.stepNumText}>3</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={avatarStyles.stepTitle}>{t('subscription.avatar.step3Title')}</Text>
              <Text style={avatarStyles.stepNote}>
                {t('subscription.avatar.step3Note')}
              </Text>
            </View>
          </View>

          <View style={avatarStyles.divider} />

          {/* Packs */}
          <Text style={avatarStyles.packsTitle}>{t('subscription.avatar.valuePacks')}</Text>
          {avatarPacks.map((pack) => (
            <View key={pack.label} style={avatarStyles.packRow}>
              <Text style={avatarStyles.packLabel}>{pack.label}</Text>
              <View style={avatarStyles.packRight}>
                <Text style={avatarStyles.packPrice}>{pack.price}</Text>
                <Text style={avatarStyles.packPerClip}>{pack.perClip}</Text>
              </View>
            </View>
          ))}

          <Text style={avatarStyles.tip}>{t('subscription.avatar.tip')}</Text>

          <TouchableOpacity
            onPress={handleSharePDF}
            disabled={isSharing}
            activeOpacity={0.7}
            style={avatarStyles.sharePdfButton}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Share2 size={16} color="#000000" strokeWidth={2.25} />
                <Text style={avatarStyles.sharePdfText}>
                  {t('subscription.sharePdf')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Step 8: Subscription Plans
 * Presents 2 paid plan cards + ATTO Avatar card with Stripe Payment Sheet integration
 */
export const StepSubscription: React.FC<
  StepProps & { onSkip?: () => void; forUserId?: number }
> = ({ state, dispatch, onNext, onBack, onSkip, isLoading, apiError, forUserId }) => {
  const { t } = useTranslation(['registration', 'common']);

  const planKey = (id: PlanId): 'record' | 'recordPro' | 'connectPro' => {
    if (id === 'record_pro') return 'recordPro';
    if (id === 'connect_pro') return 'connectPro';
    return 'record';
  };

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [activePlan, setActivePlan] = useState<PlanId | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>(null);

  const toggleExpand = (planId: PlanId) => {
    // LayoutAnimation removed — crashes on RN 0.81.5 New Architecture
    setExpandedPlan((prev) => (prev === planId ? null : planId));
  };

  const handleSubscribe = async (planId: PlanId) => {
    setIsProcessing(true);
    setActivePlan(planId);
    setPaymentError(null);

    try {
      console.log(
        '[Subscription] Creating checkout for plan:',
        planId,
        'forUserId:',
        forUserId
      );
      const { clientSecret, paymentIntentId } = await paymentService.createCheckout(
        planId,
        state.email,
        forUserId ? String(forUserId) : undefined
      );
      console.log('[Subscription] Checkout created, initializing payment sheet...');

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'ATTO Sound',
        style: 'alwaysDark',
        returnURL: 'atto://stripe-redirect',
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', testEnv: true },
      });

      if (initError) {
        console.error('[Subscription] Payment sheet init error:', initError);
        setPaymentError(initError.message);
        haptic('error');
        return;
      }

      console.log('[Subscription] Presenting payment sheet...');
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') return;
        setPaymentError(presentError.message);
        haptic('error');
        return;
      }

      await haptic('success');
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

      // Force-refresh the subscription store NOW so the home/profile
      // screens render the new plan immediately. Without this the user
      // sees "Connect (Free)" until some other event (AppState=active,
      // account-switch, manual pull-to-refresh) eventually triggers a
      // refetch — confusing and wrong for someone who just paid.
      try {
        await useSubscriptionStore.getState().fetchSubscription();
      } catch {
        // Non-fatal — initialize() / account-switch will catch up later.
      }

      await onNext();
    } catch (error: unknown) {
      setPaymentError(getErrorMessage(error, t('common:errors.paymentFailed')));
      haptic('error');
    } finally {
      setIsProcessing(false);
      setActivePlan(null);
    }
  };

  const handleContinueWithout = () => {
    haptic('light');
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
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.subtitle}>{t('subscription.subtitle')}</Text>

        {PLANS.map((plan) => {
          const isExpanded = expandedPlan === plan.id;

          return (
            <View
              key={plan.id}
              style={[styles.planCard, plan.popular && styles.planCardPopular]}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>{t('subscription.mostPopular')}</Text>
                </View>
              )}

              <View style={styles.planTop}>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>
                    {t(`subscription.plans.${planKey(plan.id)}.name`)}
                  </Text>
                  <View style={styles.priceContainer}>
                    <RNText style={styles.price} allowFontScaling={false}>
                      ${plan.price.toLocaleString()}
                    </RNText>
                    <RNText style={styles.priceUnit} allowFontScaling={false}>
                      {t('subscription.perYear')}
                    </RNText>
                  </View>
                </View>

                <Button
                  title={
                    paymentCompleted && activePlan === plan.id
                      ? t('common:buttons.continue')
                      : t('common:buttons.subscribe')
                  }
                  onPress={
                    paymentCompleted && activePlan === plan.id
                      ? () => {
                          haptic('light');
                          onNext();
                        }
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
                  {isExpanded
                    ? t('subscription.hideFeatures')
                    : t('subscription.seeFeatures')}
                </Text>
                {isExpanded ? (
                  <ChevronUp size={14} color="#666" strokeWidth={2.25} />
                ) : (
                  <ChevronDown size={14} color="#666" strokeWidth={2.25} />
                )}
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.featuresContainer}>
                  {(
                    t(`subscription.plans.${planKey(plan.id)}.features`, {
                      returnObjects: true,
                    }) as string[]
                  ).map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <Check size={16} color="#AAAAAA" strokeWidth={2.25} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Avatar card */}
        <AvatarCard />

        {(paymentError || apiError) && (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color="#FFFFFF" strokeWidth={2.25} />
            <Text style={styles.errorText}>{paymentError || apiError}</Text>
          </View>
        )}

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimer}>{t('subscription.disclaimer')}</Text>
        </View>

        <TouchableOpacity
          onPress={handleContinueWithout}
          style={styles.skipButton}
          disabled={busy}
        >
          <Text style={styles.skipText}>{t('subscription.continueWithout')}</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
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
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Archivo_400Regular',
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
    fontFamily: 'Archivo_600SemiBold',
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
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  price: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 22,
    lineHeight: 30,
    color: '#FFFFFF',
  },
  priceUnit: {
    fontFamily: 'Archivo_400Regular',
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
    fontFamily: 'Archivo_400Regular',
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
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#CCCCCC',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#FFFFFF',
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
    fontFamily: 'Archivo_400Regular',
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
    fontFamily: 'Archivo_400Regular',
    fontSize: 15,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  bottomSpacer: {
    height: 20,
  },
});

const avatarStyles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    overflow: 'visible',
  },
  floatingBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    left: '50%',
    transform: [{ translateX: -18 }],
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 1,
  },
  floatingBadgeText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 10,
    color: '#000000',
    letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  title: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  toggleText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#666',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 0,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  stepTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  stepNote: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  angleList: {
    gap: 4,
    marginTop: 4,
  },
  angleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555555',
  },
  angleText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#CCCCCC',
  },
  address: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#222222',
  },
  packsTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
    marginTop: 14,
    marginBottom: 8,
  },
  packRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  packLabel: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    color: '#D1D5DB',
  },
  packRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packPrice: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    width: 40,
    textAlign: 'right',
  },
  packPerClip: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    color: '#6B7280',
    width: 55,
    textAlign: 'right',
  },
  tip: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 14,
    lineHeight: 16,
  },
  sharePdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 18,
  },
  sharePdfText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#000000',
  },
});
