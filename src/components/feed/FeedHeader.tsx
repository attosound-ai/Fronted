import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Pressable,
  Dimensions,
  DeviceEventEmitter,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Plus,
  Users,
  Bell,
  ShoppingBag,
  Info,
  Heart,
  Ellipsis,
  X,
  SlidersHorizontal,
  Palette,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { CounterBadge } from '@/components/ui/CounterBadge';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { CreateActionSheet } from './CreateActionSheet';
import { FilterModal } from './FilterModal';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useFeedFilterStore } from '@/stores/feedFilterStore';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useCreatorLogos } from '@/features/feed/hooks/useCreatorLogos';
import { useLogoVote } from '@/features/feed/hooks/useLogoVote';
import * as ScreenOrientation from 'expo-screen-orientation';

const ATTO_LOGO_URI =
  'https://res.cloudinary.com/da9vymoah/image/upload/v1774905442/Property_1_Default_zqv4qr.png';

const HEADER_HEIGHT = 58;
const SHEET_CONTENT_HEIGHT = 320;
const SPRING_CONFIG = { damping: 22, stiffness: 180, mass: 0.8 };

/** Epoch for day-based logo rotation (2026-01-01 UTC). */
const LOGO_EPOCH = new Date('2026-01-01T00:00:00Z').getTime();
const MS_PER_DAY = 86_400_000;

function getTodayLogoIndex(count: number): number {
  if (count === 0) return 0;
  return Math.floor((Date.now() - LOGO_EPOCH) / MS_PER_DAY) % count;
}

export function FeedHeader() {
  const { t } = useTranslation('feed');
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { isTablet } = useDeviceLayout();
  const hasRecordUpload = useSubscriptionStore((s) => s.hasEntitlement('record_upload'));
  const hasAdvancedProduction = useSubscriptionStore((s) =>
    s.hasEntitlement('advanced_production')
  );
  const isCreatorWithPlan = user?.role === 'creator' && hasRecordUpload;
  const { logos: creatorLogos } = useCreatorLogos();
  const { mutate: castVote } = useLogoVote();

  // Day-based logo: rotates to next logo each calendar day
  const [todayIndex, setTodayIndex] = useState(() =>
    getTodayLogoIndex(creatorLogos.length)
  );

  useEffect(() => {
    setTodayIndex(getTodayLogoIndex(creatorLogos.length));
    // Schedule re-check at next midnight
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const timer = setTimeout(
      () => setTodayIndex(getTodayLogoIndex(creatorLogos.length)),
      msUntilMidnight + 500 // small buffer past midnight
    );
    return () => clearTimeout(timer);
  }, [creatorLogos.length]);

  const todayLogo = creatorLogos[todayIndex];
  const todayLogoUri = todayLogo?.imageUrl;

  const [comingSoonFeature, setComingSoonFeature] = useState<
    'store' | 'info' | 'dating' | null
  >(null);
  const notifUnread = useNotificationStore((s) => s.unreadCount);
  const isFilterActive = useFeedFilterStore((s) => s.isAnyFilterActive);
  const creatorsOnly = useFeedFilterStore((s) => s.filters.creatorsOnly);
  const setFilter = useFeedFilterStore((s) => s.setFilter);
  const contentTypeCount = useFeedFilterStore((s) => s.filters.contentTypes.length);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [logoFullscreen, setLogoFullscreen] = useState(false);
  const [artGalleryOpen, setArtGalleryOpen] = useState(false);
  const [artFullscreen, setArtFullscreen] = useState<string | null>(null);

  // Hidden: behind the header (top: 0 = tucked behind header bar).
  // Visible: slides down to just below the header.
  const hiddenY = 20;
  const visibleY = insets.top + HEADER_HEIGHT;

  const translateY = useSharedValue(hiddenY);

  const setSheetClosed = useCallback(() => setSheetOpen(false), []);

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    translateY.value = withSpring(visibleY, SPRING_CONFIG);
  }, [visibleY, translateY]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(hiddenY, { duration: 250 }, (finished) => {
      if (finished) runOnJS(setSheetClosed)();
    });
  }, [hiddenY, translateY, setSheetClosed]);

  // Reset position when sheet mounts
  useEffect(() => {
    if (sheetOpen) {
      translateY.value = hiddenY;
      translateY.value = withSpring(visibleY, SPRING_CONFIG);
    }
  }, [sheetOpen]);

  // Listen for sidebar menu button press (iPad)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('sidebarMenuPress', () => {
      if (sheetOpen) {
        closeSheet();
      } else {
        openSheet();
      }
    });
    return () => sub.remove();
  }, [sheetOpen, openSheet, closeSheet]);

  // Pan gesture — runs entirely on UI thread
  const panGesture = Gesture.Pan()
    .onChange((e) => {
      if (e.changeY < 0) {
        translateY.value += e.changeY;
      } else {
        translateY.value += e.changeY * 0.3;
      }
    })
    .onFinalize((e) => {
      const draggedUp = translateY.value < visibleY - 50;
      const flickedUp = e.velocityY < -300;
      if (draggedUp || flickedUp) {
        translateY.value = withTiming(hiddenY, { duration: 200 }, (finished) => {
          if (finished) runOnJS(setSheetClosed)();
        });
      } else {
        translateY.value = withSpring(visibleY, SPRING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [hiddenY, visibleY],
      [0, 0.6],
      Extrapolation.CLAMP
    ),
  }));

  const handleAction = useCallback(
    (action: () => void) => {
      closeSheet();
      setTimeout(action, 300);
    },
    [closeSheet]
  );

  return (
    <>
      {/* Sheet + overlay rendered BEHIND the header via zIndex */}
      {sheetOpen && (
        <>
          <Pressable
            style={{
              position: 'absolute',
              top: -insets.top,
              left: 0,
              width: Dimensions.get('window').width,
              height: Dimensions.get('window').height,
              zIndex: 5,
            }}
            onPress={closeSheet}
          >
            <ReAnimated.View style={[styles.overlay, overlayStyle]} />
          </Pressable>
          <GestureDetector gesture={panGesture}>
            <ReAnimated.View style={[styles.topSheet, sheetStyle]}>
              <View style={styles.sheetItem}>
                <CreatorBadge size="sm" />
                <Text style={styles.sheetText}>{t('filters.creatorsOnly')}</Text>
                <Switch
                  value={creatorsOnly}
                  onValueChange={(v) => setFilter('creatorsOnly', v)}
                  trackColor={{ false: '#333', true: '#D4AF37' }}
                  thumbColor="#FFF"
                />
                <TouchableOpacity
                  style={styles.allFiltersButton}
                  activeOpacity={0.7}
                  onPress={() => handleAction(() => setFilterVisible(true))}
                >
                  <SlidersHorizontal size={18} color="#FFF" strokeWidth={2.25} />
                  <Text style={styles.sheetText}>{t('header.menuAllFilters')}</Text>
                  {contentTypeCount > 0 && (
                    <CounterBadge
                      count={contentTypeCount}
                      color="#3B82F6"
                      style={styles.filterCountBadge}
                    />
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.sheetSeparator} />
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.7}
                onPress={() => handleAction(() => router.navigate('/following'))}
              >
                <Users size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>{t('header.menuFollowing')}</Text>
              </TouchableOpacity>
              <View style={styles.sheetSeparator} />
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.7}
                onPress={() => handleAction(() => router.navigate('/notifications'))}
              >
                <Bell size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>{t('header.menuNotifications')}</Text>
                {notifUnread > 0 && (
                  <CounterBadge count={notifUnread} style={styles.bellBadge} />
                )}
              </TouchableOpacity>
              <View style={styles.sheetSeparator} />
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.7}
                onPress={() => handleAction(() => setComingSoonFeature('store'))}
              >
                <ShoppingBag size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>{t('header.menuStore')}</Text>
              </TouchableOpacity>
              <View style={styles.sheetSeparator} />
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.7}
                onPress={() => handleAction(() => setComingSoonFeature('info'))}
              >
                <Info size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>{t('header.menuAbout')}</Text>
              </TouchableOpacity>
              <View style={styles.sheetSeparator} />
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.7}
                onPress={() => handleAction(() => setComingSoonFeature('dating'))}
              >
                <Heart size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>{t('header.menuDating')}</Text>
              </TouchableOpacity>
              <View style={styles.sheetSeparator} />
              <TouchableOpacity
                style={styles.sheetItem}
                activeOpacity={0.7}
                onPress={() => handleAction(() => setArtGalleryOpen(true))}
              >
                <Palette size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>ATTO ART</Text>
              </TouchableOpacity>
              <View style={styles.sheetHandle} />
            </ReAnimated.View>
          </GestureDetector>
        </>
      )}

      {/* Header bar — extends into status bar area to mask the sheet */}
      <View
        style={[
          styles.header,
          { marginTop: -insets.top, paddingTop: insets.top },
          isTablet && styles.headerTablet,
        ]}
      >
        {!isTablet && (
          <View style={styles.sideSlot}>
            <TouchableOpacity
              onPress={() =>
                isCreatorWithPlan
                  ? setActionSheetVisible(true)
                  : router.push('/create-post')
              }
              style={styles.iconButton}
            >
              <Plus size={30} color="#FFF" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.logoContainer}
          activeOpacity={0.7}
          onPress={async () => {
            await ScreenOrientation.unlockAsync();
            setLogoFullscreen(true);
          }}
        >
          {creatorsOnly && todayLogoUri ? (
            <Image
              source={{ uri: todayLogoUri }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={{ uri: ATTO_LOGO_URI }}
              style={styles.logo}
              resizeMode="contain"
            />
          )}
          <Text style={styles.logoSubtext} allowFontScaling={false}>
            sound
          </Text>
        </TouchableOpacity>

        {!isTablet && (
          <View style={styles.sideSlot}>
            <TouchableOpacity
              onPress={sheetOpen ? closeSheet : openSheet}
              style={styles.iconButton}
            >
              {sheetOpen ? (
                <X size={24} color="#FFF" strokeWidth={2.25} />
              ) : (
                <>
                  <Ellipsis size={24} color="#FFF" strokeWidth={2.25} />
                  {notifUnread > 0 && <View style={styles.ellipsisDot} />}
                  {isFilterActive && (
                    <View style={styles.filterIndicator}>
                      <CreatorBadge size="sm" />
                    </View>
                  )}
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ComingSoonModal
        visible={comingSoonFeature !== null}
        onClose={() => setComingSoonFeature(null)}
        icon={
          comingSoonFeature === 'store'
            ? ShoppingBag
            : comingSoonFeature === 'dating'
              ? Heart
              : Info
        }
        title={
          comingSoonFeature === 'store'
            ? t('header.menuStore')
            : comingSoonFeature === 'dating'
              ? t('header.menuDating')
              : t('header.menuAbout')
        }
        description={
          comingSoonFeature === 'store'
            ? t('header.comingSoonStore')
            : comingSoonFeature === 'dating'
              ? t('header.comingSoonDating')
              : t('header.comingSoonAbout')
        }
      />
      <CreateActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        hasAdvancedProduction={hasAdvancedProduction}
      />
      <FilterModal visible={filterVisible} onClose={() => setFilterVisible(false)} />
      <FullscreenImageViewer
        uri={creatorsOnly && todayLogoUri ? todayLogoUri : ATTO_LOGO_URI}
        logo={creatorsOnly ? todayLogo : undefined}
        onVote={
          creatorsOnly
            ? (logoId, rating) => {
                const currentRating =
                  creatorLogos.find((l) => l.id === logoId)?.userRating ?? null;
                castVote({ logoId, rating, currentRating });
              }
            : undefined
        }
        visible={logoFullscreen}
        onClose={() => setLogoFullscreen(false)}
      />
      <BottomSheet
        visible={artGalleryOpen}
        onClose={() => setArtGalleryOpen(false)}
        title="ATTO ART"
      >
        <View style={styles.artGrid}>
          {creatorLogos.map((logo) => (
            <TouchableOpacity
              key={logo.id}
              activeOpacity={0.85}
              style={styles.artCell}
              onPress={() => {
                setArtGalleryOpen(false);
                setTimeout(() => setArtFullscreen(logo.imageUrl), 300);
              }}
            >
              <Image
                source={{ uri: logo.imageUrl }}
                style={styles.artCellImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
      {artFullscreen && (
        <FullscreenImageViewer
          uri={artFullscreen}
          visible
          onClose={() => setArtFullscreen(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#000',
    zIndex: 10,
  },
  headerTablet: {
    justifyContent: 'center',
  },
  sideSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  logoContainer: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 100,
    height: 28,
  },
  creatorLogo: {
    width: 100,
    height: 28,
  },
  logoSubtext: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    fontSize: 7,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  iconButton: {
    padding: 6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 5,
  },
  topSheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 16,
    zIndex: 6,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginTop: 12,
  },
  artGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  artCell: {
    width: '32.6%',
    aspectRatio: 1,
    backgroundColor: '#111',
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artCellImage: {
    width: '90%',
    height: '90%',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sheetText: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  sheetSeparator: {
    height: 1,
    backgroundColor: '#222',
    marginHorizontal: 16,
  },
  ellipsisDot: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  filterIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  bellBadge: {
    marginLeft: 'auto',
  },
  allFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 'auto',
  },
  filterCountBadge: {
    marginLeft: 'auto',
  },
});
