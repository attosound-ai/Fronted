import { useEffect } from 'react';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { getNativeAppIcon } from '../lib/nativeIcon';
import { slotFromNative } from '../lib/appIconModel';
import { useAppIconStore } from '../stores/appIconStore';

/**
 * Makes the remembered icon match the one the phone really shows, wherever
 * the app displays it (the Settings row said "studio" while the home screen
 * had the diamond icon: client video, Oct 6 2026). Runs when `active` turns
 * true; the phone always wins.
 */
export function useAppIconResync(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void getNativeAppIcon().then((real) => {
      if (!alive) return;
      const phone = slotFromNative(real);
      const remembered = useAppIconStore.getState().selectedSlot;
      if (phone === remembered) return;
      analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_RESYNCED, {
        remembered: remembered ?? 'default',
        phone: phone ?? 'default',
      });
      useAppIconStore.getState().setSelectedSlot(phone);
    });
    return () => {
      alive = false;
    };
  }, [active]);
}
