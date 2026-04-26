import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { User, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface OutgoingCallScreenProps {
  recipientName: string;
  onCancel: () => void;
}

export function OutgoingCallScreen({ recipientName, onCancel }: OutgoingCallScreenProps) {
  const { t } = useTranslation('calls');
  return (
    <View style={styles.container}>
      <View style={styles.callerInfo}>
        <View style={styles.avatar}>
          <User size={48} color="#666" strokeWidth={2.25} />
        </View>
        <Text style={styles.callerLabel}>{t('outgoing.label')}</Text>
        <Text style={styles.callerNumber}>{recipientName}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <View style={styles.cancelIcon}>
            <View style={{ transform: [{ rotate: '135deg' }] }}>
              <Phone size={28} color="#FFF" strokeWidth={2.25} />
            </View>
          </View>
          <Text style={styles.actionLabel}>{t('outgoing.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  callerInfo: {
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  callerLabel: {
    color: '#999',
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
  },
  callerNumber: {
    color: '#FFF',
    fontSize: 28,
    fontFamily: 'Archivo_600SemiBold',
  },
  actions: {
    alignItems: 'center',
  },
  cancelButton: {
    alignItems: 'center',
    gap: 8,
  },
  cancelIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
  },
});
