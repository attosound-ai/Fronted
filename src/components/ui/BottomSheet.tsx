/**
 * BottomSheet — the app's sheet primitive, now a NATIVE sheet.
 *
 * iOS: UISheetPresentationController (system grabber, detents, dimming,
 * spring physics, keyboard avoidance, scroll hand off, VoiceOver).
 * Android: Material BottomSheetDialog (BottomSheetBehavior, edge to edge,
 * back button, nested scrolling).
 *
 * The public API is unchanged on purpose (`visible`, `onClose`, `title`,
 * `children`) so every existing sheet in the app gets the native behaviour
 * without touching its call site. Under the hood the `visible` prop drives
 * the imperative `present()` / `dismiss()` of TrueSheet, and a user driven
 * dismissal (swipe, backdrop tap, Android back) is reported through
 * `onClose` exactly as the old JS sheet did.
 *
 * Replaces the previous RN Modal + Reanimated + gesture handler sheet, whose
 * JS driven animation never matched the system feel and which needed the
 * lock/unlock remount workaround in DtmfKeypadHost.
 */

import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  TrueSheet,
  type BackgroundBlur,
  type BlurOptions,
  type SheetDetent,
} from '@lodev09/react-native-true-sheet';

import { Text } from './Text';

const SHEET_BACKGROUND = '#1A1A1A';
const SHEET_CORNER_RADIUS = 20;
/** Tallest a content sized sheet may grow (fraction of the window). */
const MAX_CONTENT_FRACTION = 0.85;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /**
   * Sheet heights (max 3). Defaults to a single content sized detent, capped
   * at 85% of the window; taller content scrolls inside its own ScrollView.
   */
  detents?: SheetDetent[];
  /**
   * Set to false while an operation must not be interrupted: the native
   * sheet then refuses swipe / backdrop dismissal (the close button inside
   * the sheet still works through `onClose`).
   */
  dismissible?: boolean;
  /**
   * Pin the first ScrollView / FlatList child to the sheet frame so it fills
   * a fixed detent (use with explicit fractional `detents`; not with 'auto').
   */
  scrollable?: boolean;
  /**
   * Fired once the native sheet is on screen. Focus text inputs here instead
   * of `autoFocus`: a field focused while the sheet is still off screen does
   * not reliably bring the keyboard up on iOS.
   */
  onPresented?: () => void;
  /**
   * Fired once the sheet is fully off screen and stays closed, for both a
   * programmatic dismiss (`visible` went false) and a user dismiss the owner
   * honoured. Navigate from here: pushing a screen while the sheet is still
   * sliding away hides the push animation behind it.
   */
  onDismissed?: () => void;
  /**
   * Overrides the opaque sheet fill. Pass 'transparent' together with
   * `backgroundBlur` for a sheet that shows what sits behind it, the way the
   * Apple call keypad does.
   */
  backgroundColor?: string;
  /** iOS material behind the sheet content. Blends with `backgroundColor`. */
  backgroundBlur?: BackgroundBlur;
  /** Strength of that material (0 to 100). Lower lets more of the backdrop through. */
  blurOptions?: BlurOptions;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  detents,
  dismissible = true,
  scrollable = false,
  onPresented,
  onDismissed,
  backgroundColor = SHEET_BACKGROUND,
  backgroundBlur,
  blurOptions,
}: BottomSheetProps) {
  const sheetRef = useRef<TrueSheet>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  // Latest values for the native callbacks without re-subscribing.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPresentedRef = useRef(onPresented);
  onPresentedRef.current = onPresented;
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  const presentedRef = useRef(false);

  const present = useCallback(() => {
    sheetRef.current?.present().catch(() => {
      // Presenting while another presentation is in flight is harmless; the
      // next `visible` change will reconcile.
    });
  }, []);

  useEffect(() => {
    if (visible) {
      // A re-run while the sheet is already up (fast refresh, a parent
      // re-render with a new callback) must not present it a second time.
      if (!presentedRef.current) present();
    } else if (presentedRef.current) {
      sheetRef.current?.dismiss().catch(() => {});
    }
  }, [visible, present]);

  const handleDidPresent = useCallback(() => {
    presentedRef.current = true;
    onPresentedRef.current?.();
  }, []);

  const handleDidDismiss = useCallback(() => {
    presentedRef.current = false;
    // Dismissed by the user (swipe, backdrop, back button): report it like the
    // old sheet did. If the owner decides to keep it open (e.g. an upload in
    // progress) `visible` stays true and we bring the sheet back.
    if (visibleRef.current) onCloseRef.current();
    setTimeout(() => {
      if (visibleRef.current && !presentedRef.current) {
        present();
        return;
      }
      // The sheet is staying closed, so it is safe to run whatever the owner
      // queued behind the dismissal (typically navigation).
      onDismissedRef.current?.();
    }, 0);
  }, [present]);

  const maxContentHeight = Math.round(windowHeight * MAX_CONTENT_FRACTION);

  // Edge to edge, like the system's own sheets. TrueSheet turns on
  // `prefersPageSizing`, which is UIKit's page sheet behaviour: the sheet
  // follows the READABLE width and ends up inset from both edges. Giving it an
  // explicit content width flips UIKit to form sizing at exactly the screen
  // width, which is what Apple's share sheet does (checked side by side on
  // David's phone, Sep 19 2026).
  const maxContentWidth = Math.round(windowWidth);

  return (
    <TrueSheet
      ref={sheetRef}
      detents={detents ?? ['auto']}
      maxContentHeight={maxContentHeight}
      backgroundColor={backgroundColor}
      backgroundBlur={backgroundBlur}
      blurOptions={blurOptions}
      cornerRadius={SHEET_CORNER_RADIUS}
      maxContentWidth={maxContentWidth}
      grabber
      dimmed
      dismissible={dismissible}
      scrollable={scrollable}
      onDidPresent={handleDidPresent}
      onDidDismiss={handleDidDismiss}
    >
      {/* Gesture handler needs its own root inside a natively presented view
          (sliders, swipeables and pressables inside sheets). flexGrow instead
          of flex so the 'auto' detent can measure the content. */}
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.content, { maxHeight: maxContentHeight }]}>
          {title ? (
            <Text variant="h3" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </GestureHandlerRootView>
    </TrueSheet>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
  },
  content: {
    // Room for the native grabber above the title and a little breathing
    // space above the home indicator (the sheet itself already accounts for
    // the safe area). Horizontal padding belongs to each sheet's own content,
    // so a full bleed row (a list, a grid) can reach the edges.
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
});
