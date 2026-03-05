import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import type { Entitlement } from '@/types';

const ENTITLEMENT_LABELS: Record<Entitlement, string> = {
  browse_search: 'Search & Discovery',
  listen: 'Listen to Recordings',
  comment: 'Comment & Engage',
  record_upload: 'Record & Upload',
  advanced_production: 'Advanced Production Suite',
  ai_avatars: 'AI Avatar Videos',
  enhanced_analytics: 'Enhanced Analytics',
  priority_discovery: 'Priority Discovery',
  talent_dashboard: 'Talent Dashboard',
  exportable_reports: 'Exportable Reports',
  early_access: 'Early Access',
  bridge_number: 'Bridge Phone Number',
};

const UPGRADE_PLANS = [
  { id: 'record' as const, name: 'Record', price: '$99/year' },
  { id: 'record_pro' as const, name: 'Record Pro', price: '$139/year' },
  { id: 'connect_pro' as const, name: 'Connect Pro', price: '$1,999/year' },
];

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  requiredEntitlement: Entitlement;
}

export function PaywallModal({ visible, onClose, requiredEntitlement }: PaywallModalProps) {
  const currentPlan = useSubscriptionStore((s) => s.getPlan());

  const handleUpgrade = () => {
    onClose();
    router.push('/subscription');
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#999" />
          </TouchableOpacity>

          <Ionicons name="lock-closed" size={40} color="#FFFFFF" />

          <Text variant="h3" style={styles.title}>
            Upgrade Required
          </Text>

          <Text variant="body" style={styles.description}>
            {ENTITLEMENT_LABELS[requiredEntitlement]} is not available on your current plan.
          </Text>

          <View style={styles.currentPlan}>
            <Text variant="caption" style={styles.currentLabel}>
              Current plan
            </Text>
            <Text variant="body" style={styles.currentValue}>
              {currentPlan === 'connect_free'
                ? 'Connect (Free)'
                : currentPlan === 'record'
                  ? 'Record'
                  : currentPlan === 'record_pro'
                    ? 'Record Pro'
                    : 'Connect Pro'}
            </Text>
          </View>

          <Button title="View Plans" onPress={handleUpgrade} style={styles.upgradeButton} />

          <TouchableOpacity onPress={onClose} style={styles.laterButton}>
            <Text style={styles.laterText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  description: {
    color: '#999999',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  currentPlan: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentLabel: {
    color: '#666666',
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  currentValue: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
  },
  upgradeButton: {
    width: '100%',
    marginTop: 4,
  },
  laterButton: {
    padding: 8,
  },
  laterText: {
    color: '#666666',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
});
