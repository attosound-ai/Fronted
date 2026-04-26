import { Pressable, StyleSheet } from 'react-native';
import { CounterBadge } from '@/components/ui/CounterBadge';

interface SidebarTabItemProps {
  icon: React.ReactNode;
  focused: boolean;
  badge?: string | number;
  large?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export function SidebarTabItem({
  icon,
  focused,
  badge,
  large,
  onPress,
  onLongPress,
}: SidebarTabItemProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.container, large && styles.containerLg, focused && styles.focused]}
    >
      {icon}
      {badge != null && <CounterBadge count={badge} style={styles.badge} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  containerLg: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  focused: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
  },
});
