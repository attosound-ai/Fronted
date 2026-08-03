import {
  StyleSheet,
  View,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { House, CirclePlay, MessageCircle, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CounterBadge } from '@/components/ui/CounterBadge';
import { ProfileTabIcon } from '@/components/ui/ProfileTabIcon';
import { useChatStore } from '@/features/messages/stores/chatStore';
import { GlassSurface } from './GlassSurface';
import { FLOATING_PILL_BOTTOM_GAP } from './navbarMetrics';

/**
 * ReelViewerTabBar — a standalone copy of the floating Liquid-Glass pill for the
 * full-screen reel viewer (reel/[id]).
 *
 * The real BottomTabBar is driven by the tabs navigator's props (state/
 * descriptors/navigation), which don't exist on a pushed route OUTSIDE (tabs).
 * So the viewer would otherwise have NO navbar. This mirrors the pill's exact
 * look (same constants, same GlassSurface) but navigates with `router` and
 * highlights the tab the viewer was opened from — so tapping any icon collapses
 * the viewer and lands on that tab, just like on the feed.
 */

// Kept in sync with BottomTabBar.tsx.
const TAB_WIDTH = 66;
const ROW_PADDING_H = 6;
const ROW_PADDING_V = 7;
const BAR_HEIGHT = 52;
const PILL_RADIUS = BAR_HEIGHT / 2;
const BUBBLE_WIDTH = 46;
const BUBBLE_HEIGHT = 38;
const BUBBLE_LEFT = ROW_PADDING_H + (TAB_WIDTH - BUBBLE_WIDTH) / 2;

export type ReelViewerTab = 'index' | 'listen' | 'messages' | 'search' | 'profile';

const TABS: readonly { key: ReelViewerTab; route: string }[] = [
  { key: 'index', route: '/' },
  { key: 'listen', route: '/listen' },
  { key: 'messages', route: '/messages' },
  { key: 'search', route: '/search' },
  { key: 'profile', route: '/profile' },
];

export function ReelViewerTabBar({ activeTab = 'index' }: { activeTab?: ReelViewerTab }) {
  const insets = useSafeAreaInsets();
  const totalUnread = useChatStore((s) => s.totalUnread);
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.key === activeTab)
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { bottom: Math.max(insets.bottom - 14, FLOATING_PILL_BOTTOM_GAP) },
      ]}
    >
      <View style={styles.pill}>
        <GlassSurface style={StyleSheet.absoluteFill} radius={PILL_RADIUS} />

        {/* Static selection bubble under the origin tab. */}
        <View
          pointerEvents="none"
          style={[
            styles.bubble,
            { transform: [{ translateX: activeIndex * TAB_WIDTH }] },
          ]}
        />

        <View style={styles.row}>
          {TABS.map((tab) => {
            const focused = tab.key === activeTab;
            const color = focused ? '#FFFFFF' : '#888888';
            const badge =
              tab.key === 'messages' && totalUnread > 0
                ? totalUnread > 99
                  ? '99+'
                  : totalUnread
                : undefined;

            const onPress = () => {
              if (focused) {
                router.back();
                return;
              }
              // navigate() finds the existing tab in the tree, collapsing the
              // pushed viewer and switching to it.
              router.navigate(tab.route as never);
            };

            return (
              <Pressable key={tab.key} onPress={onPress} style={styles.tab}>
                <View style={styles.item}>
                  {tab.key === 'index' && (
                    <House size={26} color={color} strokeWidth={focused ? 2.75 : 1.75} />
                  )}
                  {tab.key === 'listen' && (
                    <CirclePlay
                      size={26}
                      color={color}
                      strokeWidth={focused ? 2.75 : 1.75}
                    />
                  )}
                  {tab.key === 'messages' && (
                    <MessageCircle
                      size={26}
                      color={color}
                      strokeWidth={focused ? 2.75 : 1.75}
                    />
                  )}
                  {tab.key === 'search' && (
                    <Search size={26} color={color} strokeWidth={focused ? 2.75 : 1.75} />
                  )}
                  {tab.key === 'profile' && (
                    <ProfileTabIcon color={color} focused={focused} />
                  )}
                  {badge != null && (
                    <CounterBadge
                      count={badge}
                      style={styles.badge as StyleProp<ViewStyle>}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    borderRadius: PILL_RADIUS,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    paddingHorizontal: ROW_PADDING_H,
    paddingVertical: ROW_PADDING_V,
  },
  bubble: {
    position: 'absolute',
    left: BUBBLE_LEFT,
    top: (BAR_HEIGHT - BUBBLE_HEIGHT) / 2,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    borderRadius: BUBBLE_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tab: {
    width: TAB_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 10,
  },
});
