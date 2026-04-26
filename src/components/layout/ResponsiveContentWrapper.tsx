import { View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';

interface ResponsiveContentWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function ResponsiveContentWrapper({
  children,
  style,
}: ResponsiveContentWrapperProps) {
  const { isTablet, contentWidth } = useDeviceLayout();

  if (!isTablet) {
    return <View style={[styles.base, style]}>{children}</View>;
  }

  return (
    <View style={[styles.base, styles.tabletOuter, style]}>
      <View style={[styles.tabletInner, { maxWidth: contentWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
  tabletOuter: {
    alignItems: 'center',
  },
  tabletInner: {
    flex: 1,
    width: '100%',
  },
});
