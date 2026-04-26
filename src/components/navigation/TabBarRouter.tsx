import { Platform } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBar } from './BottomTabBar';
import { SidebarTabBar } from './SidebarTabBar';

export function TabBarRouter(props: BottomTabBarProps) {
  if (Platform.isPad) {
    return <SidebarTabBar {...props} />;
  }
  return <BottomTabBar {...props} />;
}
