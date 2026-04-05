import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Dimensions,
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
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { CreateActionSheet } from './CreateActionSheet';
import { FilterModal } from './FilterModal';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useFeedFilterStore } from '@/stores/feedFilterStore';
import { FullscreenImageViewer } from '@/components/ui/FullscreenImageViewer';
import { useCreatorLogos } from '@/features/feed/hooks/useCreatorLogos';
import { useLogoVote } from '@/features/feed/hooks/useLogoVote';
import * as ScreenOrientation from 'expo-screen-orientation';

const ATTO_LOGO_URI =
  'https://res.cloudinary.com/da9vymoah/image/upload/v1774905442/Property_1_Default_zqv4qr.png';

const CREATOR_LOGO_URIS = [
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/1_xnqztg.png',
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/3_r97kll.png',
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/4_zvaaqc.png',
  'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775340998/2_gl1k9h.png',
];

const HEADER_HEIGHT = 58;
const SHEET_CONTENT_HEIGHT = 320;
const SPRING_CONFIG = { damping: 22, stiffness: 180, mass: 0.8 };

export function FeedHeader() {
  const { t } = useTranslation('feed');
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const hasRecordUpload = useSubscriptionStore((s) => s.hasEntitlement('record_upload'));
  const isCreatorWithPlan = user?.role === 'creator' && hasRecordUpload;
  const { logos: creatorLogos } = useCreatorLogos();
  const { mutate: castVote } = useLogoVote();
  const creatorLogoUris = creatorLogos.map((l) => l.imageUrl);

  const [comingSoonFeature, setComingSoonFeature] = useState<
    'store' | 'info' | 'dating' | null
  >(null);
  const notifUnread = useNotificationStore((s) => s.unreadCount);
  const isFilterActive = useFeedFilterStore((s) => s.isAnyFilterActive);
  const creatorsOnly = useFeedFilterStore((s) => s.filters.creatorsOnly);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [logoFullscreen, setLogoFullscreen] = useState(false);
  const [creatorLogoIndex, setCreatorLogoIndex] = useState(0);
  const logoTranslateX = useSharedValue(0);
  const logoOpacity = useSharedValue(1);

  const advanceCreatorLogo = useCallback(() => {
    setCreatorLogoIndex((i) => (i + 1) % creatorLogoUris.length);
    // Slide in from right
    logoTranslateX.value = 30;
    logoTranslateX.value = withTiming(0, { duration: 300 });
    logoOpacity.value = withTiming(1, { duration: 300 });
  }, [logoTranslateX, logoOpacity]);

  // Rotate creator logos every 4s with carousel animation
  useEffect(() => {
    if (!creatorsOnly) {
      setCreatorLogoIndex(0);
      logoTranslateX.value = 0;
      logoOpacity.value = 1;
      return;
    }
    const interval = setInterval(() => {
      // Slide out left + fade
      logoTranslateX.value = withTiming(-30, { duration: 250 });
      logoOpacity.value = withTiming(0, { duration: 250 }, () => {
        runOnJS(advanceCreatorLogo)();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [creatorsOnly, logoTranslateX, logoOpacity, advanceCreatorLogo]);

  const creatorLogoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: logoTranslateX.value }],
    opacity: logoOpacity.value,
  }));

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
                onPress={() => handleAction(() => setFilterVisible(true))}
              >
                <SlidersHorizontal size={22} color="#FFF" strokeWidth={2.25} />
                <Text style={styles.sheetText}>{t('header.menuFilters')}</Text>
                {isFilterActive && (
                  <CreatorBadge size="sm" style={{ marginLeft: 'auto' }} />
                )}
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
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {notifUnread > 99 ? '99+' : String(notifUnread)}
                    </Text>
                  </View>
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
              <View style={styles.sheetHandle} />
            </ReAnimated.View>
          </GestureDetector>
        </>
      )}

      {/* Header bar — extends into status bar area to mask the sheet */}
      <View style={[styles.header, { marginTop: -insets.top, paddingTop: insets.top }]}>
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

        <TouchableOpacity
          style={styles.logoContainer}
          activeOpacity={0.7}
          onPress={async () => {
            await ScreenOrientation.unlockAsync();
            setLogoFullscreen(true);
          }}
        >
          {creatorsOnly ? (
            <ReAnimated.Image
              source={{ uri: creatorLogoUris[creatorLogoIndex] }}
              style={[styles.creatorLogo, creatorLogoStyle]}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={{ uri: ATTO_LOGO_URI }}
              style={styles.logo}
              resizeMode="contain"
            />
          )}
          <Text style={styles.logoSubtext}>sound</Text>
        </TouchableOpacity>

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
                {notifUnread > 0 && !isFilterActive && (
                  <View style={styles.ellipsisDot} />
                )}
                {isFilterActive && (
                  <View style={styles.filterIndicator}>
                    <CreatorBadge size="sm" />
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ComingSoonModal
        visible={comingSoonFeature !== null}
        onClose={() => setComingSoonFeature(null)}
        icon={
          comingSoonFeature === 'store'
            ? 'bag-handle-outline'
            : comingSoonFeature === 'dating'
              ? 'heart-outline'
              : 'information-circle-outline'
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
      />
      <FilterModal visible={filterVisible} onClose={() => setFilterVisible(false)} />
      <FullscreenImageViewer
        uri={creatorsOnly ? creatorLogoUris : ATTO_LOGO_URI}
        logos={creatorsOnly ? creatorLogos : undefined}
        onVote={
          creatorsOnly
            ? (logoId, vote) => {
                const currentVote =
                  creatorLogos.find((l) => l.id === logoId)?.userVote ?? null;
                castVote({ logoId, vote, currentVote });
              }
            : undefined
        }
        visible={logoFullscreen}
        onClose={() => setLogoFullscreen(false)}
      />
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
    width: 130,
    height: 36,
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
    right: 4,
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
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'Archivo_700Bold',
  },
});
