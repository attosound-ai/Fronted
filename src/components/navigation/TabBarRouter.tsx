import { Platform } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBar } from './BottomTabBar';
import { SidebarTabBar } from './SidebarTabBar';

// Routes that take over the full screen and should NOT show the floating tab bar
// (it would float over their bottom action row). The recorder is a full-screen
// DAW editor with its own close button, and during a call it also carries the
// Record / Split / Undo / Export controls right where the navbar used to cover.
const FULLSCREEN_TABS = new Set(['recording']);

export function TabBarRouter(props: BottomTabBarProps) {
  const activeRoute = props.state.routes[props.state.index]?.name;
  if (activeRoute && FULLSCREEN_TABS.has(activeRoute)) {
    return null;
  }
  // Platform.isPad exists at runtime on iOS but isn't on the union TS type.
  const isPad = Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true;
  if (isPad) {
    return <SidebarTabBar {...props} />;
  }
  return <BottomTabBar {...props} />;
}
