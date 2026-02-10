import { useQuery } from '@tanstack/react-query';
import { NotificationService } from '@/services/notificationService';

export const NOTIFICATIONS_UNREAD_QUERY_KEY = ['notifications', 'unread'] as const;

export function useNotificationsUnread(userId: string | undefined) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_UNREAD_QUERY_KEY, userId],
    queryFn: () => NotificationService.getUnreadCount(),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}
