import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface IncomingCallScreenProps {
  fromNumber: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallScreen({
  fromNumber,
  onAccept,
  onReject,
}: IncomingCallScreenProps) {
  const { t } = useTranslation('calls');
  return (
    <View style={styles.container}>
      <View style={styles.callerInfo}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={48} color="#666" />
        </View>
        <Text style={styles.callerLabel}>{t('incoming.label')}</Text>
        <Text style={styles.callerNumber}>{fromNumber}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectButton} onPress={onReject}>
          <Ionicons name="call" size={32} color="#FFF" style={styles.rejectIcon} />
          <Text style={styles.actionLabel}>{t('incoming.decline')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
          <Ionicons name="call" size={32} color="#FFF" />
          <Text style={styles.actionLabel}>{t('incoming.accept')}</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  rejectButton: {
    alignItems: 'center',
    gap: 8,
  },
  rejectIcon: {
    transform: [{ rotate: '135deg' }],
    backgroundColor: '#EF4444',
    width: 64,
    height: 64,
    borderRadius: 32,
    textAlign: 'center',
    lineHeight: 64,
    overflow: 'hidden',
  },
  acceptButton: {
    alignItems: 'center',
    gap: 8,
  },
  actionLabel: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Archivo_400Regular',
  },
});
