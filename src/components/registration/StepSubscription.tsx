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
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useStripe } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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

const AVATAR_ANGLES = [
  'Front — look straight at the camera',
  'Left 45° — turn head slightly left',
  'Right 45° — turn head slightly right',
  'Full left profile',
  'Full right profile',
  'Slight down angle',
  'Slight up angle',
];

const AVATAR_PACKS = [
  { label: 'Single', price: '$5', perClip: '$5/clip' },
  { label: '5 messages', price: '$20', perClip: '$4/clip' },
  { label: '10 messages', price: '$35', perClip: '$3.50/clip' },
  { label: '15 messages', price: '$48', perClip: '$3.20/clip' },
  { label: '20 messages', price: '$60', perClip: '$3/clip' },
];

const AVATAR_INSTRUCTIONS_HTML = `<!DOCTYPE html>
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
  <h1>ATTO Avatar Creation Instructions</h1>
  <p class="subtitle">Create your own AI Avatar to post 10-second messages on ATTO's platform.</p>
  <h2>Step 1 — Take 6–7 Photos of Your Face</h2>
  <p><strong>Rules for all photos:</strong></p>
  <ul>
    <li>Face fully visible — no hats or sunglasses</li>
    <li>Neutral expression, mouth closed</li>
    <li>Look straight at the camera unless noted</li>
    <li>Only head and shoulders should appear</li>
    <li>Plain background (walls are fine)</li>
  </ul>
  <p><strong>Required angles:</strong></p>
  <ul>
    <li>Front — look straight at the camera</li>
    <li>Left 45° — turn head slightly left</li>
    <li>Right 45° — turn head slightly right</li>
    <li>Full left profile</li>
    <li>Full right profile</li>
    <li>Slight down angle</li>
    <li>Slight up angle</li>
  </ul>
  <h2>Step 2 — Mail Photos to ATTO</h2>
  <div class="address">ATTO<br/>1245 Farmington Ave., PMB 1368<br/>West Hartford, Connecticut 06107</div>
  <p>Do not send photos via email or other platforms. Our team will upload them and create your avatar — usually in 1–3 days.</p>
  <h2>Step 3 — Your Family Posts Messages</h2>
  <p>Once your avatar is ready, family or friends log into their ATTO account, choose "Post Avatar Message," type what you want to say, and your avatar delivers it as a 10-second video — visible to everyone on ATTO and shareable privately.</p>
  <h2>Value Packs</h2>
  <table>
    <tr><th>Pack</th><th>Price</th><th>Per clip</th></tr>
    <tr><td>Single</td><td>$5</td><td>$5/clip</td></tr>
    <tr><td>5 messages</td><td>$20</td><td>$4/clip</td></tr>
    <tr><td>10 messages</td><td>$35</td><td>$3.50/clip</td></tr>
    <tr><td>15 messages</td><td>$48</td><td>$3.20/clip</td></tr>
    <tr><td>20 messages</td><td>$60</td><td>$3/clip</td></tr>
  </table>
  <p class="tip">Tip: The more angles you submit over time, the more lifelike your avatar becomes.</p>
  <div class="footer">ATTO Sound · attosound.com</div>
</body>
</html>`;

// ─── Avatar Card ──────────────────────────────────────────────────────────────

function AvatarCard({
  onGetStarted,
  disabled,
}: {
  onGetStarted: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const handleSharePDF = async () => {
    setIsSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not supported', 'Sharing is not available on this device.');
        return;
      }
      const { uri } = await Print.printToFileAsync({
        html: AVATAR_INSTRUCTIONS_HTML,
        base64: false,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'ATTO Avatar Instructions',
        UTI: 'com.adobe.pdf',
      });
    } catch (err) {
      Alert.alert('Error', 'Could not generate the PDF. Please try again.');
      console.error('[SharePDF]', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={avatarStyles.card}>
      {/* NEW badge */}
      <View style={avatarStyles.newBadge}>
        <Text style={avatarStyles.newBadgeText}>NEW</Text>
      </View>

      {/* Header row */}
      <View style={avatarStyles.header}>
        <View style={avatarStyles.iconWrap}>
          <Ionicons name="person-circle-outline" size={28} color="#A78BFA" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={avatarStyles.title}>ATTO Avatar</Text>
          <Text style={avatarStyles.subtitle}>
            AI video messages posted on your behalf
          </Text>
        </View>
      </View>

      {/* Price row */}
      <View style={avatarStyles.priceRow}>
        <View style={avatarStyles.pricePill}>
          <Ionicons name="pricetag-outline" size={12} color="#A78BFA" />
          <Text style={avatarStyles.priceText}>From $3/clip</Text>
        </View>
        <View style={avatarStyles.pricePill}>
          <Ionicons name="layers-outline" size={12} color="#A78BFA" />
          <Text style={avatarStyles.priceText}>Packs from $20</Text>
        </View>
      </View>

      <Button
        title="Get Started"
        onPress={onGetStarted}
        disabled={disabled}
        size="sm"
        style={avatarStyles.cta}
      />

      <TouchableOpacity
        onPress={handleSharePDF}
        disabled={isSharing}
        activeOpacity={0.7}
        style={avatarStyles.shareButton}
      >
        {isSharing ? (
          <ActivityIndicator size="small" color="#A78BFA" />
        ) : (
          <>
            <Ionicons name="share-outline" size={15} color="#A78BFA" />
            <Text style={avatarStyles.shareButtonText}>Share Instructions (PDF)</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Expandable instructions */}
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={avatarStyles.toggle}>
        <Text style={avatarStyles.toggleText}>
          {expanded ? 'Hide instructions' : 'How it works'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#666"
        />
      </TouchableOpacity>

      {expanded && (
        <View style={avatarStyles.body}>
          {/* Step 1 */}
          <View style={avatarStyles.step}>
            <View style={avatarStyles.stepNum}>
              <Text style={avatarStyles.stepNumText}>1</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={avatarStyles.stepTitle}>Take 6–7 photos of your face</Text>
              <Text style={avatarStyles.stepNote}>
                Face fully visible · Neutral expression · Plain background · Head and
                shoulders only
              </Text>
              <View style={avatarStyles.angleList}>
                {AVATAR_ANGLES.map((angle) => (
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
              <Text style={avatarStyles.stepTitle}>Mail photos to ATTO</Text>
              <Text style={avatarStyles.address}>
                ATTO{'\n'}
                1245 Farmington Ave., PMB 1368{'\n'}
                West Hartford, CT 06107
              </Text>
              <Text style={avatarStyles.stepNote}>
                Our team uploads them and creates your avatar in 1–3 days.
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
              <Text style={avatarStyles.stepTitle}>Your family posts messages</Text>
              <Text style={avatarStyles.stepNote}>
                They log in, choose "Post Avatar Message," type what you want to say, and
                your avatar delivers it as a 10-second video — visible to everyone on ATTO
                and shareable privately.
              </Text>
            </View>
          </View>

          <View style={avatarStyles.divider} />

          {/* Packs */}
          <Text style={avatarStyles.packsTitle}>Value Packs</Text>
          {AVATAR_PACKS.map((pack) => (
            <View key={pack.label} style={avatarStyles.packRow}>
              <Text style={avatarStyles.packLabel}>{pack.label}</Text>
              <View style={avatarStyles.packRight}>
                <Text style={avatarStyles.packPrice}>{pack.price}</Text>
                <Text style={avatarStyles.packPerClip}>{pack.perClip}</Text>
              </View>
            </View>
          ))}

          <Text style={avatarStyles.tip}>
            Tip: The more angles you submit over time, the more lifelike your avatar
            becomes.
          </Text>
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
export const StepSubscription: React.FC<StepProps & { onSkip?: () => void }> = ({
  state,
  dispatch,
  onNext,
  onBack,
  onSkip,
  isLoading,
  apiError,
}) => {
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
        state.email
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
      setPaymentError(getErrorMessage(error, t('common:errors.paymentFailed')));
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
            {t('subscription.title')}
          </Text>
          <View style={styles.backButton} />
        </View>

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
                  {isExpanded
                    ? t('subscription.hideFeatures')
                    : t('subscription.seeFeatures')}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#666"
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.featuresContainer}>
                  {(
                    t(`subscription.plans.${planKey(plan.id)}.features`, {
                      returnObjects: true,
                    }) as string[]
                  ).map((feature, index) => (
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

        {/* Avatar card */}
        <AvatarCard onGetStarted={handleContinueWithout} disabled={busy} />

        {(paymentError || apiError) && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
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
    backgroundColor: '#2D1515',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
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
    backgroundColor: '#0D0A1A',
    borderWidth: 1.5,
    borderColor: '#4C1D95',
    borderRadius: 12,
    marginBottom: 16,
    marginTop: 6,
    overflow: 'hidden',
  },
  newBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 1,
  },
  newBadgeText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 9,
    color: '#FFF',
    letterSpacing: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    paddingBottom: 12,
    paddingRight: 60,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E1033',
    alignItems: 'center',
    justifyContent: 'center',
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
  priceRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E1033',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priceText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12,
    color: '#A78BFA',
  },
  cta: {
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: '#7C3AED',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 10,
  },
  shareButtonText: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    color: '#A78BFA',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 14,
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
    backgroundColor: '#4C1D95',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
    color: '#E9D5FF',
  },
  stepTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    color: '#E9D5FF',
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
    backgroundColor: '#7C3AED',
  },
  angleText: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    color: '#C4B5FD',
  },
  address: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    color: '#E9D5FF',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1033',
  },
  packsTitle: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    color: '#A78BFA',
    marginTop: 14,
    marginBottom: 8,
  },
  packRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1033',
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
  },
  packPerClip: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    color: '#6B7280',
  },
  tip: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 14,
    lineHeight: 16,
  },
});
