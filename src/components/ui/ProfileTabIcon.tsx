import { View, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';

interface ProfileTabIconProps {
  color: string;
  focused: boolean;
}

const SINGLE_SIZE = 35;
const MULTI_SIZE = 30;
const MULTI_OFFSET = 8;

/**
 * ProfileTabIcon — purely visual, no gesture handling.
 * Gestures are handled by ProfileTabButton (tabBarButton).
 */
export function ProfileTabIcon({ color, focused }: ProfileTabIconProps) {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const user = useAuthStore((s) => s.user);

  const hasMultipleAccounts = accounts.length > 1;

  const active = hasMultipleAccounts
    ? accounts.find((a) => a.user.id === activeAccountId) ?? accounts[0]
    : null;
  const other = hasMultipleAccounts
    ? accounts.find((a) => a.user.id !== active?.user.id) ?? accounts[1]
    : null;

  if (hasMultipleAccounts && active && other) {
    return (
      <View style={styles.multiStack}>
        <Avatar
          uri={other.user.avatar}
          fallbackText={other.user.username}
          style={styles.backAvatar}
          size="sm"
        />
        <Avatar
          uri={active.user.avatar}
          fallbackText={active.user.username}
          style={[styles.frontAvatar, focused && styles.frontAvatarFocused]}
          size="sm"
        />
      </View>
    );
  }

  return (
    <Avatar
      uri={user?.avatar}
      fallbackText={user?.username}
      style={[styles.singleAvatar, focused && styles.singleAvatarFocused]}
      size="sm"
    />
  );
}

const styles = StyleSheet.create({
  singleAvatar: {
    width: SINGLE_SIZE,
    height: SINGLE_SIZE,
    borderRadius: SINGLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: '#333333',
  },
  singleAvatarFocused: {
    borderColor: '#FFFFFF',
  },
  multiStack: {
    width: MULTI_SIZE + MULTI_OFFSET,
    height: MULTI_SIZE + MULTI_OFFSET,
    position: 'relative',
  },
  backAvatar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: MULTI_SIZE,
    height: MULTI_SIZE,
    borderRadius: MULTI_SIZE / 2,
    opacity: 0.6,
  },
  frontAvatar: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MULTI_SIZE,
    height: MULTI_SIZE,
    borderRadius: MULTI_SIZE / 2,
    borderWidth: 1.5,
    borderColor: '#333333',
  },
  frontAvatarFocused: {
    borderColor: '#FFFFFF',
  },
});
