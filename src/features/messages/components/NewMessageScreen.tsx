import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING } from '@/constants/theme';
import { useUserSearch } from '../hooks/useUserSearch';
import type { User } from '@/types';

export function NewMessageScreen() {
  const { t } = useTranslation('messages');
  const [query, setQuery] = useState('');
  const { results, isLoading } = useUserSearch(query);

  // The conversation is resolved (idempotent get-or-create) by the chat route
  // via `useConversationId` — we only navigate with the participant. `replace`
  // so Back skips the search list and returns to the previous screen.
  const handleSelectUser = useCallback((user: User) => {
    router.replace({
      pathname: '/chat',
      params: {
        participantId: String(user.id),
        participantName: user.username,
      },
    });
  }, []);

  const renderUser = useCallback(
    ({ item }: { item: User }) => (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => handleSelectUser(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('newMessage.messageUserAccessibility', {
          name: item.username,
        })}
      >
        <Avatar uri={item.avatar} size="md" fallbackText={item.username} />
        <View style={styles.userInfo}>
          <Text variant="h3" numberOfLines={1}>
            {item.username}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handleSelectUser, t]
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Search
          size={18}
          color={COLORS.gray[500]}
          strokeWidth={2.25}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t('newMessage.searchPlaceholder')}
          placeholderTextColor={COLORS.gray[500]}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
          accessibilityLabel={t('newMessage.searchAccessibilityLabel')}
        />
      </View>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.white} />
        </View>
      )}
      <FlatList
        data={results}
        renderItem={renderUser}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.background.secondary,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border.dark,
    gap: SPACING.md,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
});
