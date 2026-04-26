import * as Notifications from 'expo-notifications';
import { badgeService } from './index';

type Subscription = { remove: () => void };

function extractBadge(notification: Notifications.Notification): number | null {
  const content = notification.request.content;
  const fromIos = (content as { badge?: unknown }).badge;
  if (typeof fromIos === 'number') return fromIos;
  const fromData = content.data?.badge;
  if (typeof fromData === 'number') return fromData;
  if (typeof fromData === 'string') {
    const parsed = Number(fromData);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function startBadgeNotificationListener(): Subscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    const badge = extractBadge(notification);
    if (badge === null) {
      badgeService.recompute().catch(() => {});
      return;
    }
    badgeService.apply(badge).catch(() => {});
  });
}
