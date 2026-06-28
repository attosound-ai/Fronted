import { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { HeaderBlur } from '@/components/ui/HeaderBlur';
import { useScrollOffset } from '@/contexts/ScrollOffsetContext';
import { useCallBarVisible, useScreenTopInset } from '@/hooks/useInCallChrome';
import { FLOATING_NAVBAR_CLEARANCE } from '@/components/navigation/navbarMetrics';
import { ResponsiveContentWrapper } from '@/components/layout/ResponsiveContentWrapper';
import { SearchBar } from '@/features/search/components/SearchBar';
import { UserSearchCard } from '@/features/search/components/UserSearchCard';
import { ContentGrid } from '@/features/search/components/ContentGrid';
import { useUserSearch } from '@/features/search/hooks/useUserSearch';
import { useContentSearch } from '@/features/search/hooks/useContentSearch';
import { useExploreGrid } from '@/features/search/hooks/useExploreGrid';
import { GridSkeleton, UserListSkeleton } from '@/components/ui/Skeleton';
import { COLORS } from '@/constants/theme';

type SearchTab = 'people' | 'content';

// Fallbacks for the collapsible header's height before it's measured (onLayout
// then provides the exact value, so these only matter for the first frame).
const SEARCH_BAR_BAND = 66; // searchRow paddings + SearchBar
const TAB_BAR_BAND = 45; // People/Content tabs, only when there's a query

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
  const insets = useSafeAreaInsets();
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useDebounce(300);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');

  const hasQuery = rawQuery.length > 0;

  // Explore's header is PINNED — the search bar stays visible while you scroll
  // (no hide-on-scroll here, unlike the other screens). It's still a floating
  // overlay so content scrolls behind the same fading blur; we just measure its
  // height so the lists offset by exactly the right amount. Scroll still drives
  // the bottom navbar collapse via the global scroll handler.
  const { scrollHandler } = useScrollOffset();
  // 0 when the green call bar already owns the status-bar area, else the inset.
  const topInset = useScreenTopInset();
  // During a call the pinned header recolors to the green call bar.
  const inCall = useCallBarVisible();
  const [measuredBand, setMeasuredBand] = useState(0);
  // Reset the measurement when the tabs appear/disappear so the estimate covers
  // the height change until the next layout pass lands.
  useEffect(() => {
    setMeasuredBand(0);
  }, [hasQuery]);
  const estimatedBand = SEARCH_BAR_BAND + (hasQuery ? TAB_BAR_BAND : 0);
  const headerHeight = topInset + (measuredBand || estimatedBand);

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setMeasuredBand((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
  }, []);

  const handleChange = useCallback(
    (text: string) => {
      setRawQuery(text);
      setDebouncedQuery(text);
    },
    [setDebouncedQuery]
  );

  const { data: users = [], isLoading: loadingUsers } = useUserSearch(debouncedQuery);
  const { data: posts = [], isLoading: loadingContent } =
    useContentSearch(debouncedQuery);
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
    <View style={styles.container}>
      <ResponsiveContentWrapper>
        {/* State: no query → Explore grid */}
        {!hasQuery && (
          <>
            {isLoadingExplore ? (
              <View style={{ paddingTop: headerHeight }}>
                <GridSkeleton count={12} />
              </View>
            ) : (
              <ContentGrid
                posts={explorePosts}
                onEndReached={loadMore}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: headerHeight }}
                sourceContext={{ source: 'feed' }}
                ListFooterComponent={
                  isFetchingMore ? (
                    <ActivityIndicator color="#555" style={styles.footerSpinner} />
                  ) : null
                }
              />
            )}
          </>
        )}

        {/* State: with query → Search results (tabs live in the header) */}
        {hasQuery && (
          <>
            {/* People tab */}
            {activeTab === 'people' && (
              <>
                {loadingUsers && debouncedQuery.length > 0 ? (
                  <View style={{ paddingTop: headerHeight }}>
                    <UserListSkeleton count={5} />
                  </View>
                ) : users.length > 0 ? (
                  <FlatList
                    data={users}
                    keyExtractor={(u) => String(u.id)}
                    renderItem={({ item }: { item: (typeof users)[number] }) => (
                      <UserSearchCard user={item} />
                    )}
                    contentContainerStyle={{
                      paddingTop: headerHeight,
                      paddingBottom: insets.bottom + FLOATING_NAVBAR_CLEARANCE,
                    }}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={styles.divider} />}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                  />
                ) : debouncedQuery.length > 0 ? (
                  <View style={[styles.centered, { paddingTop: headerHeight }]}>
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
                  <View style={{ paddingTop: headerHeight }}>
                    <GridSkeleton count={6} />
                  </View>
                ) : posts.length > 0 ? (
                  <ContentGrid
                    posts={posts}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ paddingTop: headerHeight }}
                    sourceContext={{ source: 'search', sourceQuery: debouncedQuery }}
                  />
                ) : debouncedQuery.length > 0 ? (
                  <View style={[styles.centered, { paddingTop: headerHeight }]}>
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

        {/* Pinned floating header: SearchBar (+ tabs when searching) stays put
            while content scrolls behind its fading blur — no hide-on-scroll. */}
        <View
          pointerEvents="box-none"
          style={[styles.floatingHeader, { paddingTop: topInset }]}
        >
          {inCall ? (
            <HeaderBlur tintRgb="34, 197, 85" solid fadeExtend={36} />
          ) : (
            <HeaderBlur />
          )}
          <View onLayout={onHeaderLayout}>
            <View style={styles.searchRow}>
              <SearchBar
                value={rawQuery}
                onChangeText={handleChange}
                placeholder={t('search.placeholder', 'Search...')}
              />
            </View>

            {hasQuery && (
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
                      style={[
                        styles.tabLabel,
                        activeTab === tab.id && styles.tabLabelActive,
                      ]}
                      maxFontSizeMultiplier={1.1}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </ResponsiveContentWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
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
