import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { AccountSwitcherBottomSheet } from './AccountSwitcherBottomSheet';
import { useProfileTabGestures } from '@/hooks/useProfileTabGestures';

interface ProfileTabButtonProps {
  children: React.ReactNode;
  onPress?: (e?: any) => void;
  style?: any;
}

/**
 * ProfileTabButton — custom tabBarButton for the profile tab on iPhone.
 *
 * - Single tap: navigates to profile immediately
 * - Double-tap: switches to previous account
 * - Long-press (500ms): opens AccountSwitcherBottomSheet
 *
 * The iPad sidebar uses the same gestures via `useProfileTabGestures` in
 * `SidebarTabBar` — keep gesture behavior in sync by editing the hook.
 */
export function ProfileTabButton(props: ProfileTabButtonProps | BottomTabBarButtonProps) {
  const { children, onPress, style } = props;

  const singleTap = useCallback(() => onPress?.(), [onPress]);
  const { handlePress, handleLongPress, switcherVisible, closeSwitcher } =
    useProfileTabGestures(singleTap);

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

      <AccountSwitcherBottomSheet visible={switcherVisible} onClose={closeSwitcher} />
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
