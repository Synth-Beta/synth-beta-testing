import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  type: 'friend_request' | 'event_interest' | 'review_like' | 'review_comment' | 'event_reminder' | 'friend_accepted';
  title: string;
  message: string;
  user_id?: string;
  event_id?: string;
  review_id?: string;
  is_read: boolean;
  created_at: string;
  data?: any;
}

/**
 * Filters out processed friend request notifications by checking if the friend request still exists and is pending
 * @param notifications - Array of notifications to filter
 * @returns Array of active notifications (excluding processed friend requests)
 */
export async function filterActiveNotifications(notifications: Notification[]): Promise<Notification[]> {
  const activeNotifications: Notification[] = [];
  
  for (const notification of notifications) {
    if (notification.type === 'friend_request') {
      console.log(`🔍 Debug: Notification ${notification.id} data:`, notification.data);
      console.log(`🔍 Debug: Notification ${notification.id} request_id:`, (notification.data as any)?.request_id);
      
      // Check if the friend request still exists and is pending
      const requestId = (notification.data as any)?.request_id;
      if (requestId) {
        const { data: friendRequest } = await supabase
          .from('user_relationships')
          .select('status')
          .eq('id', requestId)
          .eq('relationship_type', 'friend')
          .single();
        
        if (friendRequest && friendRequest.status === 'pending') {
          activeNotifications.push(notification);
        } else {
          console.log(`🔍 Debug: Friend request ${requestId} is no longer pending, removing notification`);
        }
      }
    } else {
      activeNotifications.push(notification);
    }
  }
  
  return activeNotifications;
}

/**
 * Fetches notifications for a user with automatic filtering of processed friend requests
 * @param userId - The user ID to fetch notifications for
 * @param limit - Maximum number of notifications to fetch (default: 50)
 * @returns Array of active notifications
 */
export async function fetchUserNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }

    console.log('🔔 Fetched notifications:', data);
    
    // Filter out processed friend requests
    return await filterActiveNotifications(data || []);
  } catch (error) {
    console.error('Error in fetchUserNotifications:', error);
    return [];
  }
}
