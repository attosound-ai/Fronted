/** Notification types supported by the backend */
export type NotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'repost'
  | 'share'
  | 'message'
  | 'welcome';

export interface NotificationActor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  role?: 'creator' | 'representative' | 'listener' | null;
}

/** Single notification as returned by GET /notifications */
export interface NotificationItem {
  id: string;
  recipientId: string;
  type: NotificationType;
  actorId: string;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
  actor: NotificationActor;
}

/** A grouped notification for display (e.g. "A, B and 3 others liked your post") */
export interface GroupedNotification {
  groupKey: string;
  type: NotificationType;
  referenceId: string | null;
  latestNotification: NotificationItem;
  actors: NotificationActor[];
  count: number;
  notificationIds: string[];
  isRead: boolean;
  createdAt: string;
}

export type TimeSection = 'today' | 'thisWeek' | 'earlier';

export interface NotificationSection {
  title: TimeSection;
  data: GroupedNotification[];
}
