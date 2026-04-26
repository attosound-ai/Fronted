import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
const BASE_COLOR = '#1A1A1A';

// ── Primitives ──────────────────────────────────────────────────────────────

interface BoneProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
}

/** Animated shimmer box — the building block for all skeletons. */
export function Bone({ width, height, radius = 4, style }: BoneProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: BASE_COLOR, opacity },
        style,
      ]}
    />
  );
}

/** Row of bones with consistent spacing. */
export function BoneRow({
  children,
  gap = 10,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>
      {children}
    </View>
  );
}

// ── Composite Templates ─────────────────────────────────────────────────────

/** Post card skeleton — matches FeedPostCard layout. */
export function PostCardSkeleton() {
  const { contentWidth } = useDeviceLayout();
  return (
    <View style={tpl.postCard}>
      <BoneRow style={tpl.postHeader}>
        <Bone width={36} height={36} radius={18} />
        <View style={{ flex: 1, gap: 6 }}>
          <Bone width={120} height={12} />
          <Bone width={80} height={10} />
        </View>
      </BoneRow>
      <Bone width={contentWidth} height={contentWidth * 0.75} radius={0} />
      <BoneRow gap={16} style={tpl.postActions}>
        <Bone width={26} height={26} radius={13} />
        <Bone width={26} height={26} radius={13} />
        <Bone width={26} height={26} radius={13} />
        <Bone width={26} height={26} radius={13} />
      </BoneRow>
      <View style={tpl.postEngagement}>
        <Bone width={160} height={10} />
        <Bone width={100} height={10} />
      </View>
    </View>
  );
}

/** Feed skeleton — 3 post cards with separators. */
export function FeedSkeleton() {
  return (
    <>
      <PostCardSkeleton />
      <View style={tpl.separator} />
      <PostCardSkeleton />
      <View style={tpl.separator} />
      <PostCardSkeleton />
    </>
  );
}

/** Conversation row skeleton — matches ConversationItem layout. */
function ConversationRowSkeleton() {
  return (
    <BoneRow gap={12} style={tpl.conversationRow}>
      <Bone width={52} height={52} radius={26} />
      <View style={{ flex: 1, gap: 6 }}>
        <Bone width={130} height={13} />
        <Bone width={200} height={11} />
      </View>
      <Bone width={40} height={10} />
    </BoneRow>
  );
}

/** Messages list skeleton — conversation rows. */
export function MessagesSkeleton() {
  return (
    <View style={tpl.listContainer}>
      {Array.from({ length: 8 }).map((_, i) => (
        <ConversationRowSkeleton key={i} />
      ))}
    </View>
  );
}

/** Notification row skeleton. */
function NotificationRowSkeleton() {
  return (
    <BoneRow gap={12} style={tpl.notificationRow}>
      <Bone width={40} height={40} radius={20} />
      <View style={{ flex: 1, gap: 5 }}>
        <Bone width={180} height={12} />
        <Bone width={120} height={10} />
      </View>
      <Bone width={36} height={36} radius={6} />
    </BoneRow>
  );
}

/** Notifications screen skeleton. */
export function NotificationsSkeleton() {
  return (
    <View style={tpl.listContainer}>
      <Bone width={60} height={14} style={{ marginBottom: 12, marginLeft: 16 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <NotificationRowSkeleton key={i} />
      ))}
    </View>
  );
}

/** Profile hero skeleton — avatar, name, stats. */
export function ProfileSkeleton() {
  return (
    <View style={tpl.profileContainer}>
      <Bone width={80} height={80} radius={40} />
      <Bone width={140} height={16} style={{ marginTop: 12 }} />
      <Bone width={100} height={12} style={{ marginTop: 6 }} />
      <BoneRow gap={24} style={{ marginTop: 16 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Bone width={36} height={16} />
          <Bone width={50} height={10} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Bone width={36} height={16} />
          <Bone width={50} height={10} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Bone width={36} height={16} />
          <Bone width={50} height={10} />
        </View>
      </BoneRow>
      <Bone width={'90%'} height={36} radius={8} style={{ marginTop: 16 }} />
    </View>
  );
}

/** Grid tile skeleton — for search explore, bookmarks, user posts grid. */
export function GridSkeleton({ count = 9 }: { count?: number }) {
  const { contentWidth } = useDeviceLayout();
  const tileSize = (contentWidth - 4) / 3;
  return (
    <View style={tpl.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <Bone
          key={i}
          width={tileSize}
          height={tileSize}
          radius={0}
          style={{ margin: 0.5 }}
        />
      ))}
    </View>
  );
}

/** Reels / Listen tab skeleton — fullscreen vertical cards. */
export function ReelsSkeleton() {
  const { contentWidth } = useDeviceLayout();
  return (
    <View style={tpl.reelsContainer}>
      <Bone width={contentWidth} height={contentWidth * 1.5} radius={0} />
      <View style={tpl.reelsOverlay}>
        <Bone width={36} height={36} radius={18} />
        <Bone width={120} height={14} />
        <Bone width={contentWidth * 0.7} height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

/** User row skeleton — for following list, search results. */
function UserRowSkeleton() {
  return (
    <BoneRow gap={12} style={tpl.userRow}>
      <Bone width={44} height={44} radius={22} />
      <View style={{ flex: 1, gap: 5 }}>
        <Bone width={120} height={13} />
        <Bone width={90} height={11} />
      </View>
      <Bone width={80} height={32} radius={8} />
    </BoneRow>
  );
}

/** User list skeleton — following, followers, search results. */
export function UserListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={tpl.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <UserRowSkeleton key={i} />
      ))}
    </View>
  );
}

/** Bookmark grid skeleton. */
export function BookmarksSkeleton() {
  return (
    <View>
      <BoneRow gap={8} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Bone width={60} height={28} radius={14} />
        <Bone width={60} height={28} radius={14} />
        <Bone width={60} height={28} radius={14} />
      </BoneRow>
      <GridSkeleton count={9} />
    </View>
  );
}

/** Suggested accounts carousel skeleton — circular avatars in a row. */
export function SuggestedAccountsSkeleton() {
  return (
    <BoneRow gap={16} style={tpl.suggestedRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={{ alignItems: 'center', gap: 6 }}>
          <Bone width={64} height={64} radius={32} />
          <Bone width={56} height={10} />
        </View>
      ))}
    </BoneRow>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const tpl = StyleSheet.create({
  postCard: { paddingBottom: 8 },
  postHeader: { padding: 12 },
  postActions: { paddingHorizontal: 12, paddingVertical: 10 },
  postEngagement: { paddingHorizontal: 12, gap: 6 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
    marginVertical: 8,
  },
  conversationRow: { paddingHorizontal: 16, paddingVertical: 14 },
  notificationRow: { paddingHorizontal: 16, paddingVertical: 12 },
  userRow: { paddingHorizontal: 16, paddingVertical: 10 },
  listContainer: { flex: 1, paddingTop: 8 },
  profileContainer: { alignItems: 'center', paddingTop: 20, paddingBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  reelsContainer: { flex: 1, position: 'relative' },
  reelsOverlay: { position: 'absolute', bottom: 80, left: 16, gap: 4 },
  suggestedRow: { paddingHorizontal: 16, paddingVertical: 12 },
});
