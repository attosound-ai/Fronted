/**
 * ReactionBar — displays grouped emoji reactions below a message bubble.
 *
 * Each unique emoji is shown as a pill with its count.
 * Tapping a pill toggles the current user's reaction.
 */

import { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';
import type { Reaction } from '../types';

interface ReactionBarProps {
  /** Compact: no outer padding, for a bar anchored to a bubble corner. */
  compact?: boolean;
  reactions: Reaction[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
}

function ReactionBarInner({
  reactions,
  currentUserId,
  onToggle,
  compact,
}: ReactionBarProps) {
  if (reactions.length === 0) return null;

  // Group by emoji: { "❤️": { count: 3, isMine: true }, ... }
  const grouped = new Map<string, { count: number; isMine: boolean }>();
  for (const r of reactions) {
    const existing = grouped.get(r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.userId === currentUserId) existing.isMine = true;
    } else {
      grouped.set(r.emoji, { count: 1, isMine: r.userId === currentUserId });
    }
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {Array.from(grouped.entries()).map(([emoji, { count, isMine }]) => (
        <TouchableOpacity
          key={emoji}
          style={[styles.pill, isMine && styles.pillActive]}
          onPress={() => onToggle(emoji)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          {count > 1 && <Text style={styles.count}>{count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const ReactionBar = memo(ReactionBarInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: SPACING.md,
  },
  containerCompact: { marginTop: 0, paddingHorizontal: 0 },
  // A hairline of the chat background separates the pill from the bubble it
  // overlaps, the way WhatsApp cuts its reaction out of the bubble.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[800],
    borderRadius: 13,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
    borderWidth: 1.5,
    borderColor: COLORS.black,
  },
  // Mine stays dark (a white pill vanishes on a white bubble) and is marked
  // by its ring instead.
  pillActive: {
    borderColor: COLORS.white,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 11,
    color: COLORS.white,
    fontFamily: 'Archivo_500Medium',
  },
});
