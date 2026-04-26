import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { paymentService } from '@/lib/api/paymentService';
import type { PlanChangePreview, PlanId } from '@/types';

interface PlanChangeBottomSheetProps {
  visible: boolean;
  targetPlan: PlanId | null;
  planLabel: string;
  onClose: () => void;
  onConfirm: (preview: PlanChangePreview) => void;
  isProcessing: boolean;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function PlanChangeBottomSheet({
  visible,
  targetPlan,
  planLabel,
  onClose,
  onConfirm,
  isProcessing,
}: PlanChangeBottomSheetProps) {
  const { t, i18n } = useTranslation('subscription');
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !targetPlan) {
      setPreview(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    paymentService
      .previewPlanChange(targetPlan)
      .then(setPreview)
      .catch(() => setError(t('errorPreviewFailed', { defaultValue: 'Could not load preview' })))
      .finally(() => setIsLoading(false));
  }, [visible, targetPlan, t]);

  const isUpgrade = preview?.direction === 'upgrade';
  const isDowngrade = preview?.direction === 'downgrade';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('changeSheet.title', { defaultValue: 'Change plan' })}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFF" />
          </View>
        )}

        {error && !isLoading && (
          <Text style={styles.error}>{error}</Text>
        )}

        {preview && !isLoading && (
          <>
            <Text style={styles.targetPlan}>{planLabel}</Text>

            {isUpgrade && (
              <>
                <Text
                  style={styles.amount}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.1}
                >
                  {formatUsd(preview.amountDueCents)}
                </Text>
                <Text style={styles.subtitle}>
                  {t('changeSheet.upgradeSubtitle', {
                    defaultValue:
                      'Charged today for the {{days}} days remaining in your current cycle.',
                    days: preview.daysRemaining,
                  })}
                </Text>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>
                    {t('changeSheet.activatesNow', { defaultValue: 'Activates immediately' })}
                  </Text>
                </View>
              </>
            )}

            {isDowngrade && (
              <>
                <Text
                  style={styles.amount}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.1}
                >
                  $0.00
                </Text>
                <Text style={styles.subtitle}>
                  {t('changeSheet.downgradeSubtitle', {
                    defaultValue:
                      "You'll keep your current plan until {{date}}, then switch to {{plan}} at the next billing cycle. No refund for the remaining time on your current plan.",
                    date: formatDate(preview.appliesAt, i18n.language),
                    plan: planLabel,
                  })}
                </Text>
              </>
            )}

            {preview.direction === 'same' && (
              <Text style={styles.subtitle}>
                {t('changeSheet.alreadyOnPlan', {
                  defaultValue: "You're already on this plan.",
                })}
              </Text>
            )}

            <Button
              title={
                isUpgrade
                  ? t('changeSheet.confirmUpgrade', {
                      defaultValue: 'Pay {{amount}} & upgrade',
                      amount: formatUsd(preview.amountDueCents),
                    })
                  : t('changeSheet.confirmDowngrade', { defaultValue: 'Schedule downgrade' })
              }
              onPress={() => onConfirm(preview)}
              loading={isProcessing}
              disabled={isProcessing || preview.direction === 'same'}
              style={styles.confirmButton}
            />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    minHeight: 240,
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  error: {
    color: '#EF4444',
    textAlign: 'center',
    paddingVertical: 24,
  },
  targetPlan: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: '#999',
  },
  amount: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 36,
    lineHeight: 48,
    color: '#FFF',
    marginTop: 8,
    paddingVertical: 4,
  },
  subtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
    marginTop: 12,
  },
  row: {
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222',
  },
  rowLabel: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    color: '#10B981',
  },
  confirmButton: {
    marginTop: 24,
  },
});
