import type {
  NotificationItem,
  GroupedNotification,
  NotificationSection,
  TimeSection,
} from '../types';

function getTimeSection(dateStr: string): TimeSection {
  const now = new Date();
  const date = new Date(dateStr);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) return 'today';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 7 * 24 * 60 * 60 * 1000) return 'thisWeek';

  return 'earlier';
}

function buildGroupKey(n: NotificationItem): string {
  if (n.referenceId && ['like', 'comment', 'repost', 'share'].includes(n.type)) {
    return `${n.type}_${n.referenceId}`;
  }
  if (n.type === 'follow') return 'follow_all';
  // Messages: group by actor (same person sending multiple messages)
  if (n.type === 'message') return `message_${n.actorId}`;
  // Welcome: never grouped
  return `${n.type}_${n.id}`;
}

/**
 * Groups flat notifications into time-sectioned, aggregated groups.
 *
 * Grouping strategy (Instagram-style):
 * - like/comment/repost/share: grouped by {type}_{referenceId} (same post)
 * - follow: all grouped together
 * - message: grouped by actor (same person sending multiple messages)
 * - welcome: never grouped
 */
export function groupNotifications(
  notifications: NotificationItem[]
): NotificationSection[] {
  const sectionMap = new Map<TimeSection, Map<string, NotificationItem[]>>();

  for (const n of notifications) {
    const section = getTimeSection(n.createdAt);
    if (!sectionMap.has(section)) sectionMap.set(section, new Map());
    const groups = sectionMap.get(section)!;
    const key = buildGroupKey(n);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  const sectionOrder: TimeSection[] = ['today', 'thisWeek', 'earlier'];
  const sections: NotificationSection[] = [];

  for (const sectionKey of sectionOrder) {
    const groups = sectionMap.get(sectionKey);
    if (!groups || groups.size === 0) continue;

    const grouped: GroupedNotification[] = [];

    for (const [groupKey, items] of groups) {
      const latest = items[0];
      const uniqueActors = new Map<string, NotificationItem['actor']>();
      for (const item of items) {
        if (!uniqueActors.has(item.actor.id)) {
          uniqueActors.set(item.actor.id, item.actor);
        }
      }

      grouped.push({
        groupKey,
        type: latest.type,
        referenceId: latest.referenceId,
        latestNotification: latest,
        actors: Array.from(uniqueActors.values()),
        count: items.length,
        notificationIds: items.map((i) => i.id),
        isRead: items.every((i) => i.isRead),
        createdAt: latest.createdAt,
      });
    }

    grouped.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    sections.push({ title: sectionKey, data: grouped });
  }

  return sections;
}
