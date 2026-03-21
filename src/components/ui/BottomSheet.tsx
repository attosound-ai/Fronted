import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  Keyboard,
  type KeyboardEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

import { Text } from './Text';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 400;

// ── Context for scroll coordination ──────────────────────────────────

interface BottomSheetScrollCtx {
  contentScrollY: SharedValue<number>;
  isDragging: SharedValue<boolean>;
}

const BottomSheetScrollContext = createContext<BottomSheetScrollCtx | null>(null);

export function useBottomSheetScroll() {
  return useContext(BottomSheetScrollContext);
}

// ── Component ────────────────────────────────────────────────────────

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const dragY = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const keyboardOffset = useSharedValue(0);
  const contentScrollY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const prevTouchY = useSharedValue(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keep context ref stable across renders
  const [scrollCtx] = useState<BottomSheetScrollCtx>(() => ({
    contentScrollY,
    isDragging,
  }));

  const dismissKeyboard = () => Keyboard.dismiss();

  const close = () => {
    Keyboard.dismiss();
    onCloseRef.current();
  };

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      prevTouchY.value = e.changedTouches[0].y;
    })
    .onTouchesMove((e, stateManager) => {
      const currentY = e.changedTouches[0].y;
      const delta = currentY - prevTouchY.value;
      prevTouchY.value = currentY;

      if (delta > 2) {
        // Swiping down — activate if scroll is at top (or no scroll)
        if (contentScrollY.value <= 1) {
          stateManager.activate();
        } else {
          stateManager.fail();
        }
      } else if (delta < -2) {
        // Swiping up — let scroll handle it
        stateManager.fail();
      }
    })
    .onStart(() => {
      isDragging.value = true;
      runOnJS(dismissKeyboard)();
    })
    .onChange((e) => {
      if (e.changeY > 0) {
        dragY.value += e.changeY;
      } else {
        dragY.value += e.changeY * 0.15;
      }
      const progress = Math.min(dragY.value / (SCREEN_HEIGHT * 0.35), 1);
      overlayOpacity.value = 1 - progress;
    })
    .onFinalize((e) => {
      isDragging.value = false;

      if (dragY.value > DISMISS_THRESHOLD || e.velocityY > VELOCITY_THRESHOLD) {
        dragY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        overlayOpacity.value = withTiming(0, { duration: 250 }, () => {
          dragY.value = 0;
          runOnJS(close)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 15, stiffness: 120 });
        overlayOpacity.value = withTiming(1, { duration: 150 });
      }
    });

  // ── Keyboard ──

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      keyboardOffset.value = withTiming(e.endCoordinates.height, {
        duration: e.duration || 250,
      });
    };
    const onHide = (e: KeyboardEvent) => {
      keyboardOffset.value = withTiming(0, { duration: e.duration || 200 });
    };

    const showSub = Keyboard.addListener('keyboardWillShow', onShow);
    const hideSub = Keyboard.addListener('keyboardWillHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  // ── Open / Close ──

  useEffect(() => {
    if (visible) {
      dragY.value = 0;
      contentScrollY.value = 0;
      translateY.value = withTiming(0, { duration: 300 });
      overlayOpacity.value = withTiming(1, { duration: 300 });
    } else {
      keyboardOffset.value = 0;
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
      overlayOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [visible, translateY, dragY, overlayOpacity, keyboardOffset, contentScrollY]);

  // ── Animated styles ──

  const sheetStyle = useAnimatedStyle(() => ({
    bottom: keyboardOffset.value,
    transform: [{ translateY: translateY.value + dragY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <TouchableWithoutFeedback onPress={close}>
          <Animated.View style={[styles.overlay, overlayStyle]} />
        </TouchableWithoutFeedback>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.container, sheetStyle]}>
            <View style={styles.handleZone}>
              <View style={styles.handle} />
            </View>

            {title && (
              <Text variant="h3" style={styles.title}>
                {title}
              </Text>
            )}

            <BottomSheetScrollContext.Provider value={scrollCtx}>
              {children}
            </BottomSheetScrollContext.Provider>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#666666',
    borderRadius: 2,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
});
