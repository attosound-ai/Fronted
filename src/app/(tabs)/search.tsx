import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { SearchBar } from '@/features/search/components/SearchBar';
import { UserSearchCard } from '@/features/search/components/UserSearchCard';
import { ContentGrid } from '@/features/search/components/ContentGrid';
import { useUserSearch } from '@/features/search/hooks/useUserSearch';
import { useContentSearch } from '@/features/search/hooks/useContentSearch';
import { useExploreGrid } from '@/features/search/hooks/useExploreGrid';

type SearchTab = 'people' | 'content';

function useDebounce(delayMs = 300): [string, (next: string) => void] {
  const [debounced, setDebounced] = useState('');

  const update = useCallback(
    (next: string) => {
      const t = setTimeout(() => setDebounced(next), delayMs);
      return () => clearTimeout(t);
    },
    [delayMs]
  );

  return [debounced, update];
}

export default function SearchScreen() {
  const { t } = useTranslation('feed');
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useDebounce(300);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');

  const handleChange = useCallback(
    (text: string) => {
      setRawQuery(text);
      setDebouncedQuery(text);
    },
    [setDebouncedQuery]
  );

  const { data: users = [], isLoading: loadingUsers } = useUserSearch(debouncedQuery);
  const { data: posts = [], isLoading: loadingContent } = useContentSearch(debouncedQuery);
  const {
    posts: explorePosts,
    isLoading: isLoadingExplore,
    isFetchingMore,
    loadMore,
  } = useExploreGrid();

  const tabs: { id: SearchTab; label: string }[] = [
    { id: 'people', label: t('search.tabPeople', 'People') },
    { id: 'content', label: t('search.tabContent', 'Content') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search bar — always visible */}
      <View style={styles.searchRow}>
        <SearchBar
          value={rawQuery}
          onChangeText={handleChange}
          placeholder={t('search.placeholder', 'Search...')}
        />
      </View>

      {/* State: no query → Explore grid */}
      {rawQuery.length === 0 && (
        <>
          {isLoadingExplore ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#FFF" />
            </View>
          ) : (
            <ContentGrid
              posts={explorePosts}
              onEndReached={loadMore}
              ListFooterComponent={
                isFetchingMore ? (
                  <ActivityIndicator color="#555" style={styles.footerSpinner} />
                ) : null
              }
            />
          )}
        </>
      )}

      {/* State: with query → Search results with tabs */}
      {rawQuery.length > 0 && (
        <>
          {/* Tab bar */}
          <View style={styles.tabBar}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text
                  variant="body"
                  style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* People tab */}
          {activeTab === 'people' && (
            <>
              {loadingUsers && debouncedQuery.length > 0 ? (
                <View style={styles.centered}>
                  <ActivityIndicator color="#FFF" />
                </View>
              ) : users.length > 0 ? (
                <FlatList
                  data={users}
                  keyExtractor={(u) => String(u.id)}
                  renderItem={({ item }: { item: (typeof users)[number] }) => (
                    <UserSearchCard user={item} />
                  )}
                  showsVerticalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={styles.divider} />}
                />
              ) : debouncedQuery.length > 0 ? (
                <View style={styles.centered}>
                  <Text variant="body" style={styles.emptyText}>
                    {t('search.noResults', 'No results for "{{query}}"', {
                      query: debouncedQuery,
                    })}
                  </Text>
                </View>
              ) : null}
            </>
          )}

          {/* Content tab */}
          {activeTab === 'content' && (
            <>
              {loadingContent && debouncedQuery.length > 0 ? (
                <View style={styles.centered}>
                  <ActivityIndicator color="#FFF" />
                </View>
              ) : posts.length > 0 ? (
                <ContentGrid posts={posts} />
              ) : debouncedQuery.length > 0 ? (
                <View style={styles.centered}>
                  <Text variant="body" style={styles.emptyText}>
                    {t('search.noResults', 'No results for "{{query}}"', {
                      query: debouncedQuery,
                    })}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#FFF',
  },
  tabLabel: {
    color: '#666',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
  },
  tabLabelActive: {
    color: '#FFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#111',
    marginHorizontal: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  footerSpinner: {
    padding: 16,
  },
});
