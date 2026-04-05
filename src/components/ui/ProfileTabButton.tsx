import { useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { AccountSwitcherBottomSheet } from './AccountSwitcherBottomSheet';
import { useAccountStore } from '@/stores/accountStore';
import { haptic } from '@/lib/haptics/hapticService';

interface ProfileTabButtonProps {
  children: React.ReactNode;
  onPress?: (e?: any) => void;
  style?: any;
}

/**
 * ProfileTabButton — custom tabBarButton for the profile tab.
 *
 * - Single tap: navigates to profile immediately
 * - Double-tap: switches to previous account (no delay on first tap)
 * - Long-press (500ms): opens AccountSwitcherBottomSheet with haptic feedback
 */
export function ProfileTabButton(props: ProfileTabButtonProps | BottomTabBarButtonProps) {
  const { children, onPress, style } = props;
  const [switcherVisible, setSwitcherVisible] = useState(false);

  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const previousAccountId = useAccountStore((s) => s.previousAccountId);
  const switchToAccount = useAccountStore((s) => s.switchToAccount);

  const lastTapRef = useRef(0);
  const switchingRef = useRef(false);

  const handlePress = (e: any) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    // Double-tap: switch to the other account
    if (delta < 400 && accounts.length > 1 && !switchingRef.current) {
      // Use previousAccountId if available, otherwise find the other account
      const targetId =
        previousAccountId ?? accounts.find((a) => a.user.id !== activeAccountId)?.user.id;

      if (targetId) {
        switchingRef.current = true;
        haptic('light');
        switchToAccount(targetId).finally(() => {
          switchingRef.current = false;
        });
        return;
      }
    }

    // Single tap: navigate to profile immediately
    onPress?.(e);
  };

  const handleLongPress = () => {
    haptic('light');
    setSwitcherVisible(true);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={[style, styles.button]}
      >
        {children}
      </Pressable>

      <AccountSwitcherBottomSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
