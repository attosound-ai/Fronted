import { BadgeService } from './BadgeService';
import { ExpoBadgeCounter } from './ExpoBadgeCounter';
import { ChatUnreadSource } from './sources/ChatUnreadSource';
import { NotificationUnreadSource } from './sources/NotificationUnreadSource';

export const badgeService = new BadgeService(new ExpoBadgeCounter(), [
  new ChatUnreadSource(),
  new NotificationUnreadSource(),
]);

export { BadgeService } from './BadgeService';
export { ExpoBadgeCounter } from './ExpoBadgeCounter';
export type { BadgeCounter, UnreadSource } from './types';
