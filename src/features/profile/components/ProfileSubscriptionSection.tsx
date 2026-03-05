import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const PLAN_LABELS: Record<string, string> = {
  connect_free: 'Connect (Free)',
  record: 'Record',
  record_pro: 'Record Pro',
  connect_pro: 'Connect Pro',
};

export function ProfileSubscriptionSection() {
  const plan = useSubscriptionStore((s) => s.getPlan());
  const subscription = useSubscriptionStore((s) => s.subscription);
  const isFree = plan === 'connect_free';

  return (
    <View style={styles.section}>
      <Text variant="caption" style={styles.sectionTitle}>
        SUBSCRIPTION
      </Text>

      <View style={styles.card}>
        <View style={styles.planRow}>
          <View style={styles.planInfo}>
            <Ionicons
              name={isFree ? 'sparkles-outline' : 'diamond'}
              size={20}
              color={isFree ? '#666' : '#FFFFFF'}
            />
            <Text variant="body" style={styles.planName}>
              {PLAN_LABELS[plan] ?? plan}
            </Text>
          </View>
          {!isFree && subscription?.expiresAt && (
            <Text variant="caption" style={styles.expiry}>
              Renews {new Date(subscription.expiresAt).toLocaleDateString()}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/subscription')}
          style={styles.manageButton}
          activeOpacity={0.7}
        >
          <Text style={styles.manageText}>
            {isFree ? 'Upgrade Plan' : 'Manage Subscription'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#999" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {},
  sectionTitle: {
    color: '#666',
    fontFamily: 'Poppins_500Medium',
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
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
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
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
});
