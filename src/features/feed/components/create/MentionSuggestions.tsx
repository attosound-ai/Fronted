import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { useUserSearch } from '@/features/messages/hooks/useUserSearch';
import type { TaggedPerson } from '../../utils/mentions';

interface MentionSuggestionsProps {
  /** What has been typed after the "@", or an empty string right after it. */
  query: string;
  /** Not offered to themselves, the way Instagram leaves the author out. */
  selfId: string;
  onPick: (person: TaggedPerson) => void;
}

/**
 * The list Instagram drops under the caption the moment you type "@": the
 * people you can tag, picked by name, with the face beside each one so you
 * can tell two similar handles apart.
 *
 * It searches from the second character, which is what the user search
 * endpoint answers; with only the "@" typed it says what to do instead of
 * showing an empty box.
 */
export function MentionSuggestions({ query, selfId, onPick }: MentionSuggestionsProps) {
  const { t } = useTranslation('feed');
  const { results, isLoading } = useUserSearch(query);

  const people = useMemo(
    () => results.filter((u) => String(u.id) !== selfId).slice(0, 12),
    [results, selfId]
  );

  if (query.length < 2) {
    return (
      <View style={styles.hintRow}>
        <Text style={styles.hint}>{t('create.mentionHint')}</Text>
      </View>
    );
  }

  if (people.length === 0) {
    return (
      <View style={styles.hintRow}>
        <Text style={styles.hint}>
          {isLoading ? t('create.mentionSearching') : t('create.mentionEmpty')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={people}
      horizontal={false}
      keyboardShouldPersistTaps="always"
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyExtractor={(u) => String(u.id)}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            void haptic('selection');
            onPick({ id: String(item.id), username: item.username });
          }}
          accessibilityRole="button"
          accessibilityLabel={item.username}
        >
          <Avatar
            uri={item.avatar}
            size="sm"
            fallbackText={item.username}
            creatorRing={item.role === 'creator'}
          />
          <View style={styles.names}>
            <View style={styles.handleRow}>
              <Text style={styles.handle} numberOfLines={1}>
                {item.username}
              </Text>
              {item.role === 'creator' ? <CreatorBadge size="sm" /> : null}
            </View>
            {item.displayName ? (
              <Text style={styles.displayName} numberOfLines={1}>
                {item.displayName}
              </Text>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 218 },
  listContent: { paddingVertical: 4 },
  hintRow: { paddingHorizontal: 16, paddingVertical: 14 },
  hint: { color: '#8A8A8F', fontSize: 13, fontFamily: 'Archivo_400Regular' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  names: { flex: 1 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  handle: { color: COLORS.white, fontSize: 15, fontFamily: 'Archivo_600SemiBold' },
  displayName: {
    color: '#8A8A8F',
    fontSize: 13,
    fontFamily: 'Archivo_400Regular',
    marginTop: 1,
  },
});
