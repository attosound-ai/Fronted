import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';

interface ProfileInfoRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  showDivider?: boolean;
}

export function ProfileInfoRow({
  icon,
  label,
  value,
  valueColor = '#FFFFFF',
  showDivider = true,
}: ProfileInfoRowProps) {
  return (
    <View style={[styles.container, showDivider && styles.divider]}>
      <View style={styles.left}>
        {icon && <Ionicons name={icon} size={18} color="#888888" />}
        <Text variant="body" style={styles.label}>
          {label}
        </Text>
      </View>
      <Text
        variant="body"
        style={[styles.value, { color: valueColor }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#222222',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  label: {
    color: '#888888',
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '55%',
  },
});
