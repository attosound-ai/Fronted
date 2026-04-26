import * as Notifications from 'expo-notifications';
import type { BadgeCounter } from './types';

export class ExpoBadgeCounter implements BadgeCounter {
  set(count: number): Promise<boolean> {
    const safe = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    return Notifications.setBadgeCountAsync(safe);
  }

  get(): Promise<number> {
    return Notifications.getBadgeCountAsync();
  }
}
