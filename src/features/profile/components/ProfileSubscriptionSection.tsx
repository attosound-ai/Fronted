import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Star, Gem, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';

export function ProfileSubscriptionSection() {
  const { t } = useTranslation('profile');
  // `getResolvedPlan()` is null until the subscription for the ACTIVE account is
  // loaded (owner-tagged) — do NOT default to "Connect Free" during that window,
  // which flashed the wrong plan on launch / after an account switch.
  const resolvedPlan = useSubscriptionStore((s) => s.getResolvedPlan());
  const subscription = useSubscriptionStore((s) => s.subscription);
  const role = useAuthStore((s) => s.user?.role);
  const inmateNumber = useAuthStore((s) => s.user?.inmateNumber);
  const isResolved = resolvedPlan !== null;
  const isFree = isResolved && resolvedPlan === 'connect_free';

  // Subscriptions are creator-only — listeners and representatives don't pay.
  if (role !== 'creator' || !inmateNumber) return null;

  const PLAN_LABELS: Record<string, string> = {
    connect_free: t('subscription.planConnectFree'),
    record: t('subscription.planRecord'),
    record_pro: t('subscription.planRecordPro'),
    connect_pro: t('subscription.planConnectPro'),
  };

  return (
    <View style={styles.section}>
      <Text variant="caption" style={styles.sectionTitle}>
        {t('subscription.sectionTitle')}
      </Text>

      <View style={styles.card}>
        <View style={styles.planRow}>
          <View style={styles.planInfo}>
            {!isResolved ? (
              <Gem size={20} color="#333" strokeWidth={2.25} />
            ) : isFree ? (
              <Star size={20} color="#666" strokeWidth={2.25} />
            ) : (
              <Gem size={20} color="#FFFFFF" strokeWidth={2.25} />
            )}
            <Text
              variant="body"
              style={[styles.planName, !isResolved && styles.planNameLoading]}
            >
              {isResolved ? (PLAN_LABELS[resolvedPlan] ?? resolvedPlan) : '—'}
            </Text>
          </View>
          {isResolved && !isFree && subscription?.expiresAt && (
            <Text variant="caption" style={styles.expiry}>
              {t('subscription.renewsLabel', {
                date: new Date(subscription.expiresAt).toLocaleDateString(),
              })}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/subscription')}
          style={styles.manageButton}
          activeOpacity={0.7}
        >
          <Text style={styles.manageText}>
            {isFree
              ? t('subscription.upgradePlan')
              : t('subscription.manageSubscription')}
          </Text>
          <ChevronRight size={16} color="#999" strokeWidth={2.25} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {},
  sectionTitle: {
    color: '#666',
    fontFamily: 'Archivo_500Medium',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planName: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  planNameLoading: {
    color: '#555',
  },
  expiry: {
    color: '#666',
    fontSize: 11,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  manageText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
  },
});
