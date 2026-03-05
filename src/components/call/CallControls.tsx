import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CallControlsProps {
  isMuted: boolean;
  isOnHold: boolean;
  isCapturing: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onToggleCapture: () => void;
  onHangUp: () => void;
}

export function CallControls({
  isMuted,
  isOnHold,
  isCapturing,
  onToggleMute,
  onToggleHold,
  onToggleCapture,
  onHangUp,
}: CallControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ControlButton
          icon={isMuted ? 'mic-off' : 'mic'}
          label={isMuted ? 'Unmute' : 'Mute'}
          active={isMuted}
          onPress={onToggleMute}
        />
        <ControlButton
          icon={isOnHold ? 'play' : 'pause'}
          label={isOnHold ? 'Resume' : 'Hold'}
          active={isOnHold}
          onPress={onToggleHold}
        />
        <ControlButton
          icon={isCapturing ? 'stop-circle' : 'radio-button-on'}
          label={isCapturing ? 'Stop' : 'Capture'}
          active={isCapturing}
          activeColor="#EF4444"
          onPress={onToggleCapture}
        />
      </View>

      <TouchableOpacity style={styles.hangUpButton} onPress={onHangUp}>
        <Ionicons name="call" size={28} color="#FFF" style={styles.hangUpIcon} />
      </TouchableOpacity>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  activeColor = '#3B82F6',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  activeColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.controlButton, active && { backgroundColor: activeColor + '22' }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={24} color={active ? activeColor : '#FFFFFF'} />
      <Text style={[styles.controlLabel, active && { color: activeColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 40,
  },
  row: {
    flexDirection: 'row',
    gap: 24,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#222',
    gap: 4,
  },
  controlLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },
  hangUpButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
