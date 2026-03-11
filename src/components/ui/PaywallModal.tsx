import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import type { Entitlement } from '@/types';

const ENTITLEMENT_KEY_MAP: Record<Entitlement, string> = {
  browse_search: 'browseSearch',
  listen: 'listen',
  comment: 'comment',
  record_upload: 'recordUpload',
  advanced_production: 'advancedProduction',
  ai_avatars: 'aiAvatars',
  enhanced_analytics: 'enhancedAnalytics',
  priority_discovery: 'priorityDiscovery',
  talent_dashboard: 'talentDashboard',
  exportable_reports: 'exportableReports',
  early_access: 'earlyAccess',
  bridge_number: 'bridgeNumber',
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

export function PaywallModal({
  visible,
  onClose,
  requiredEntitlement,
}: PaywallModalProps) {
  const { t } = useTranslation('common');
  const currentPlan = useSubscriptionStore((s) => s.getPlan());

  const getEntitlementLabel = (key: Entitlement) =>
    t(`entitlements.${ENTITLEMENT_KEY_MAP[key]}` as 'entitlements.browseSearch');

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
            {t('paywall.upgradeRequired')}
          </Text>

          <Text variant="body" style={styles.description}>
            {t('paywall.notAvailable', {
              feature: getEntitlementLabel(requiredEntitlement),
            })}
          </Text>

          <View style={styles.currentPlan}>
            <Text variant="caption" style={styles.currentLabel}>
              {t('paywall.currentPlan')}
            </Text>
            <Text variant="body" style={styles.currentValue}>
              {currentPlan === 'connect_free'
                ? t('planNames.connectFree')
                : currentPlan === 'record'
                  ? t('planNames.record')
                  : currentPlan === 'record_pro'
                    ? t('planNames.recordPro')
                    : t('planNames.connectPro')}
            </Text>
          </View>

          <Button
            title={t('buttons.viewPlans')}
            onPress={handleUpgrade}
            style={styles.upgradeButton}
          />

          <TouchableOpacity onPress={onClose} style={styles.laterButton}>
            <Text style={styles.laterText}>{t('paywall.maybeLater')}</Text>
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
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  description: {
    color: '#999999',
    fontFamily: 'Archivo_400Regular',
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
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
  },
  currentValue: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
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
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
  },
});
