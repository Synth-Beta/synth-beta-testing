import { supabase } from '@/integrations/supabase/client';
import type { 
  Notification, 
  NotificationWithDetails, 
  NotificationFilters, 
  NotificationStats,
  NotificationType 
} from '@/types/notifications';

export class NotificationService {
  /**
   * Get notifications for the current user with optional filters
   */
  static async getNotifications(filters: NotificationFilters = {}): Promise<{
    notifications: NotificationWithDetails[];
    total: number;
  }> {
    try {
      let query = supabase
        .from('notifications_with_details')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      
      if (filters.is_read !== undefined) {
        query = query.eq('is_read', filters.is_read);
      }

      // Apply pagination
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        notifications: (data as NotificationWithDetails[]) || [],
        total: count || 0
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw new Error(`Failed to get notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unread notifications for the current user
   */
  static async getUnreadNotifications(): Promise<NotificationWithDetails[]> {
    const result = await this.getNotifications({ is_read: false, limit: 50 });
    return result.notifications;
  }

  /**
   * Get notification statistics for the current user
   */
  static async getNotificationStats(): Promise<NotificationStats> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('type, is_read')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

      if (error) throw error;

      const stats: NotificationStats = {
        total: data?.length || 0,
        unread: data?.filter(n => !n.is_read).length || 0,
        by_type: {
          friend_request: 0,
          friend_accepted: 0,
          match: 0,
          message: 0,
          review_liked: 0,
          review_commented: 0,
          comment_replied: 0,
          event_interest: 0
        }
      };

      // Count by type
      data?.forEach(notification => {
        stats.by_type[notification.type as NotificationType]++;
      });

      return stats;
    } catch (error) {
      console.error('Error fetching notification stats:', error);
      throw new Error(`Failed to get notification stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_unread_notification_count');

      if (error) {
        // If the function doesn't exist yet, fallback to direct query
        if (error.code === 'PGRST202' || error.message?.includes('Could not find the function')) {
          console.log('Notification function not found, falling back to direct query');
          const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
            .eq('is_read', false);
          
          return count || 0;
        }
        throw error;
      }

      return data || 0;
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('mark_notification_read', {
        notification_id: notificationId
      });

      if (error) {
        // If the function doesn't exist yet, fallback to direct update
        if (error.code === 'PGRST202' || error.message?.includes('Could not find the function')) {
          console.log('Notification function not found, falling back to direct update');
          const { error: updateError } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
          
          if (updateError) throw updateError;
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw new Error(`Failed to mark notification as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark all notifications as read for the current user
   */
  static async markAllAsRead(): Promise<void> {
    try {
      const { error } = await supabase.rpc('mark_all_notifications_read');

      if (error) {
        // If the function doesn't exist yet, fallback to direct update
        if (error.code === 'PGRST202' || error.message?.includes('Could not find the function')) {
          console.log('Notification function not found, falling back to direct update');
          const { error: updateError } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
            .eq('is_read', false);
          
          if (updateError) throw updateError;
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw new Error(`Failed to mark all notifications as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Subscribe to real-time notification updates
   */
  static subscribeToNotifications(
    onNotification: (notification: NotificationWithDetails) => void,
    onUpdate: (notification: NotificationWithDetails) => void,
    onDelete: (notificationId: string) => void
  ) {
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${(supabase.auth.getUser() as any).data?.user?.id}`
        },
        async (payload) => {
          try {
            // Fetch the full notification with details
            const { data } = await supabase
              .from('notifications_with_details')
              .select('*')
              .eq('id', payload.new.id)
              .single();

            if (data) {
              onNotification(data as NotificationWithDetails);
            }
          } catch (error) {
            console.error('Error fetching new notification details:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${(supabase.auth.getUser() as any).data?.user?.id}`
        },
        async (payload) => {
          try {
            // Fetch the updated notification with details
            const { data } = await supabase
              .from('notifications_with_details')
              .select('*')
              .eq('id', payload.new.id)
              .single();

            if (data) {
              onUpdate(data as NotificationWithDetails);
            }
          } catch (error) {
            console.error('Error fetching updated notification details:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${(supabase.auth.getUser() as any).data?.user?.id}`
        },
        (payload) => {
          onDelete(payload.old.id);
        }
      )
      .subscribe();

    return channel;
  }

  /**
   * Unsubscribe from notification updates
   */
  static unsubscribeFromNotifications(channel: any) {
    if (channel) {
      supabase.removeChannel(channel);
    }
  }

  /**
   * Get notification icon based on type
   */
  static getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'friend_request':
        return '👋';
      case 'friend_accepted':
        return '✅';
      case 'review_liked':
        return '❤️';
      case 'review_commented':
        return '💬';
      case 'comment_replied':
        return '🔄';
      case 'match':
        return '🎯';
      case 'message':
        return '📨';
      case 'event_interest':
        return '🎵';
      default:
        return '🔔';
    }
  }

  /**
   * Get notification color based on type
   */
  static getNotificationColor(type: NotificationType): string {
    switch (type) {
      case 'friend_request':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'friend_accepted':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'review_liked':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'review_commented':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'comment_replied':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'match':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'message':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'event_interest':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  /**
   * Format notification time
   */
  static formatNotificationTime(createdAt: string): string {
    const now = new Date();
    const notificationTime = new Date(createdAt);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) { // 24 hours
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days}d ago`;
    }
  }
}
