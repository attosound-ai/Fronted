import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING } from '@/constants/theme';
import { useUserSearch } from '../hooks/useUserSearch';
import { messageService } from '../services/messageService';
import type { User } from '@/types';

export function NewMessageScreen() {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { results, isLoading } = useUserSearch(query);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleSelectUser = useCallback(
    async (user: User) => {
      if (isCreating) return;
      setIsCreating(true);
      setError(null);
      try {
        const conversationId = await messageService.createConversation({
          participantId: String(user.id),
          participantName: user.displayName || user.username,
        });
        router.replace({
          pathname: '/chat',
          params: {
            conversationId,
            participantName: user.displayName || user.username,
            participantId: String(user.id),
          },
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t('newMessage.errorFailedToStart');
        setError(message);
        setIsCreating(false);
      }
    },
    [isCreating]
  );

  const renderUser = useCallback(
    ({ item }: { item: User }) => (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => handleSelectUser(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('newMessage.messageUserAccessibility', {
          name: item.displayName || item.username,
        })}
      >
        <Avatar uri={item.avatar} size="md" />
        <View style={styles.userInfo}>
          <Text variant="h3" numberOfLines={1}>
            {item.displayName || item.username}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handleSelectUser]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('newMessage.backAccessibilityLabel')}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>
        <Text variant="h2">{t('newMessage.headerTitle')}</Text>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons
          name="search-outline"
          size={18}
          color={COLORS.gray[500]}
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
      {isCreating && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
          <Text variant="caption" style={styles.creatingText}>
            {t('newMessage.creatingConversation')}
          </Text>
        </View>
      )}
      {error && (
        <Text variant="caption" style={styles.errorText}>
          {error}
        </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  backButton: {
    padding: SPACING.xs,
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
  creatingText: {
    color: COLORS.gray[500],
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    padding: SPACING.md,
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
