import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/Text';

interface ProfileActionsSectionProps {
  onLogout: () => void;
}

export function ProfileActionsSection({ onLogout }: ProfileActionsSectionProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onLogout}
        activeOpacity={0.7}
        style={styles.logoutButton}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  logoutText: {
    color: '#EF4444',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
});
