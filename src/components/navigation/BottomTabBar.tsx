import { View, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CounterBadge } from '@/components/ui/CounterBadge';

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? '#FFFFFF' : '#888888';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        const icon = options.tabBarIcon?.({ color, focused, size: 26 });
        const badge = options.tabBarBadge;
        const TabButton = options.tabBarButton;

        const content = (
          <View style={styles.item}>
            {icon}
            {badge != null && (
              <CounterBadge
                count={badge}
                style={[styles.badge, options.tabBarBadgeStyle as StyleProp<ViewStyle>]}
              />
            )}
          </View>
        );

        if (TabButton) {
          return (
            <TabButton key={route.key} onPress={onPress} style={styles.tab}>
              {content}
            </TabButton>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222222',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
  },
});
