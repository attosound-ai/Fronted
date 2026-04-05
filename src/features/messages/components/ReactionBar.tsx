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
  reactions: Reaction[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
}

function ReactionBarInner({ reactions, currentUserId, onToggle }: ReactionBarProps) {
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
    <View style={styles.container}>
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 3,
  },
  pillActive: {
    backgroundColor: '#1E3A5F',
    borderWidth: 1,
    borderColor: '#3B82F6',
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
