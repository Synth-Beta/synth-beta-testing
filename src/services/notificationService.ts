import { supabase } from '@/integrations/supabase/client';
import type { 
  Notification, 
  NotificationWithDetails, 
  NotificationFilters, 
  NotificationStats,
  NotificationType 
} from '@/types/notifications';
import { cacheService, CacheKeys, CacheTTL } from './cacheService';

export class NotificationService {
  /**
   * Get notifications for the current user with optional filters
   */
  static async getNotifications(filters: NotificationFilters = {}): Promise<{
    notifications: NotificationWithDetails[];
    total: number;
  }> {
    try {
      // Get current user ID for filtering (consistent with fallback method)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Prepare cache key (only for first page, no filters)
      const shouldCache = !filters.offset && !filters.type && filters.is_read === undefined;
      const cacheKey = shouldCache ? `notifications_${user.id}_${filters.limit || 50}` : null;

      // Check cache
      if (shouldCache && cacheKey) {
        const cached = cacheService.get<{ notifications: NotificationWithDetails[]; total: number }>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Try to use the view first, but catch any errors (including 404) and fallback
      try {
        let query = supabase
          .from('notifications_with_details')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id) // Explicitly filter by user_id for consistency and safety
          .order('created_at', { ascending: false });

        // Apply filters
        if (filters.type) {
          query = query.eq('type', filters.type);
        }
        
        if (filters.is_read !== undefined) {
          query = query.eq('is_read', filters.is_read);
        }

        // Apply pagination with buffer to account for client-side filtering
        // The offset should apply to the database query, not the filtered results
        // This ensures pagination is based on database position, not filtered position
        const requestedLimit = filters.limit || 20;
        const offset = filters.offset || 0;
        // Fetch 50% more than requested to account for processed friend requests that will be filtered out
        const fetchLimit = Math.ceil(requestedLimit * 1.5);
        // Apply offset to database query - this ensures we get the correct database items for this page
        query = query.range(offset, offset + fetchLimit - 1);

        const { data, error, count } = await query;

        // If view doesn't exist (404, PGRST205, or any error mentioning the view), fallback to notifications table
        if (error) {
          const errorCode = error.code || (error as any)?.statusCode || (error as any)?.status;
          const errorMessage = (error.message || String(error) || '').toLowerCase();
          const errorDetails = ((error as any)?.details || '').toLowerCase();
          const errorHint = ((error as any)?.hint || '').toLowerCase();
          
          // Check for various error codes that indicate the view doesn't exist
          // Also check HTTP status codes (404 can come through as number or string)
          const isViewNotFound = 
            errorCode === 'PGRST205' || 
            errorCode === '42P01' ||
            errorCode === 404 ||
            errorCode === '404' ||
            String(errorCode) === '404' ||
            errorMessage?.includes('notifications_with_details') ||
            errorMessage?.includes('does not exist') ||
            errorMessage?.includes('relation') ||
            errorMessage?.includes('not found') ||
            errorMessage?.includes('404') ||
            errorDetails?.includes('notifications_with_details') ||
            errorHint?.includes('notifications_with_details') ||
            // Check if the error is a 404 HTTP error (common in Supabase REST API)
            (error as any)?.status === 404 ||
            (error as any)?.statusCode === 404;
          
          if (isViewNotFound) {
            // Silently fallback - no need to log this expected error
            return await this.getNotificationsWithManualJoin(filters);
          }
          
          // If it's a different error, throw it
          throw error;
        }
        
        // If no error and we have data, process it
        if (data !== null && data !== undefined) {
          // Filter out processed friend request notifications
          // Batch check friend request statuses to reduce queries
          const friendRequestNotifications = ((data as NotificationWithDetails[]) || []).filter(n => n.type === 'friend_request' && n.data?.request_id);
          
          // If we have friend request notifications, try to check their status in batch
          let processedRequestIds: Set<string> = new Set();
          if (friendRequestNotifications.length > 0) {
            try {
              const requestIds = friendRequestNotifications.map(n => n.data.request_id).filter(Boolean);
              if (requestIds.length > 0) {
                // Try to get all non-pending requests in one query
                const { data: processedRequests } = await supabase
                  .from('user_relationships')
                  .select('id')
                  .in('id', requestIds)
                  .eq('relationship_type', 'friend')
                  .neq('status', 'pending');
                
                if (processedRequests) {
                  processedRequestIds = new Set(processedRequests.map(r => r.id));
                }
              }
            } catch (error: any) {
              // If batch query fails (RLS), skip filtering - include all notifications
              // This is expected with RLS restrictions, so don't log
            }
          }

          // Filter notifications
          const filteredNotifications = ((data as NotificationWithDetails[]) || []).map((notif) => {
            // Check if this is a processed friend request
            if (notif.type === 'friend_request' && notif.data?.request_id) {
              const requestId = notif.data.request_id;
              if (processedRequestIds.has(requestId)) {
                return null; // Filter out processed requests
              }
            }
            return notif;
          });

          // Filter out null values (processed friend requests)
          const validNotifications = filteredNotifications.filter(n => n !== null) as NotificationWithDetails[];

          // Return only the requested amount to maintain pagination contract
          // The offset was already applied to the database query, so we just need to limit the results
          // After filtering, we may have fewer than requested, so we slice to the requested limit
          const paginatedNotifications = validNotifications.slice(0, requestedLimit);

          // Return the original database count to enable proper pagination
          // Note: This count includes processed friend requests that are filtered out client-side.
          // The returned array may contain fewer items than the total due to client-side filtering,
          // but the total count allows pagination UI to work correctly.
          const result = {
            notifications: paginatedNotifications,
            total: count || 0
          };

          // Cache the result (only for first page, no filters)
          if (shouldCache && cacheKey) {
            cacheService.set(cacheKey, result, CacheTTL.NOTIFICATIONS);
          }

          return result;
        } else {
          // No data returned, fallback
          return await this.getNotificationsWithManualJoin(filters);
        }
      } catch (viewError: any) {
        // Catch any exceptions (including network errors, 404s, etc.) and fallback
        const errorMessage = viewError?.message || String(viewError) || '';
        const errorCode = viewError?.code || viewError?.statusCode || viewError?.status;
        
        // If it's clearly a "view doesn't exist" error, fallback silently
        if (
          errorCode === 'PGRST205' || 
          errorCode === '42P01' ||
          errorCode === 404 ||
          errorMessage?.includes('notifications_with_details') ||
          errorMessage?.includes('does not exist') ||
          errorMessage?.includes('Not Found') ||
          errorMessage?.includes('404')
        ) {
          return await this.getNotificationsWithManualJoin(filters);
        }
        
        // If it's a different error, re-throw it
        throw viewError;
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw new Error(`Failed to get notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fallback method to get notifications with manual joins when view doesn't exist
   */
  private static async getNotificationsWithManualJoin(filters: NotificationFilters = {}): Promise<{
    notifications: NotificationWithDetails[];
    total: number;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Query notifications table
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    
    if (filters.is_read !== undefined) {
      query = query.eq('is_read', filters.is_read);
    }

    // Apply pagination with buffer to account for client-side filtering
    // The offset should apply to the database query, not the filtered results
    // This ensures pagination is based on database position, not filtered position
    const requestedLimit = filters.limit || 20;
    const offset = filters.offset || 0;
    // Fetch 50% more than requested to account for processed friend requests that will be filtered out
    const fetchLimit = Math.ceil(requestedLimit * 1.5);
    // Apply offset to database query - this ensures we get the correct database items for this page
    query = query.range(offset, offset + fetchLimit - 1);

    const { data: notifications, error, count } = await query;
    if (error) throw error;

    if (!notifications || notifications.length === 0) {
      return { notifications: [], total: count || 0 };
    }

    // Filter out processed friend request notifications first
    // Batch check friend request statuses to reduce queries
    const friendRequestNotifications = notifications.filter(n => n.type === 'friend_request' && n.data?.request_id);
    
    // If we have friend request notifications, try to check their status in batch
    let processedRequestIds: Set<string> = new Set();
    if (friendRequestNotifications.length > 0) {
      try {
        const requestIds = friendRequestNotifications.map(n => n.data.request_id).filter(Boolean);
        if (requestIds.length > 0) {
          // Try to get all non-pending requests in one query
          const { data: processedRequests } = await supabase
            .from('user_relationships')
            .select('id')
            .in('id', requestIds)
            .eq('relationship_type', 'friend')
            .neq('status', 'pending');
          
          if (processedRequests) {
            processedRequestIds = new Set(processedRequests.map(r => r.id));
          }
        }
      } catch (error: any) {
        // If batch query fails (RLS), skip filtering - include all notifications
        // This is expected with RLS restrictions, so don't log
      }
    }

    // Filter notifications
    const activeNotifications = notifications.map((notif) => {
      // Check if this is a processed friend request
      if (notif.type === 'friend_request' && notif.data?.request_id) {
        const requestId = notif.data.request_id;
        if (processedRequestIds.has(requestId)) {
          return null; // Filter out processed requests
        }
      }
      return notif;
    });

    // Filter out null values (processed friend requests)
    const validNotifications = activeNotifications.filter(n => n !== null) as any[];

    // Return only the requested amount to maintain pagination contract
    // The offset was already applied to the database query, so we just need to limit the results
    // After filtering, we may have fewer than requested, so we slice to the requested limit
    const paginatedNotifications = validNotifications.slice(0, requestedLimit);

    // Return the original database count to enable proper pagination (consistent with main method)
    // Note: This count includes processed friend requests that are filtered out client-side.
    // The returned array may contain fewer items than the total due to client-side filtering,
    // but the total count allows pagination UI to work correctly.
    if (paginatedNotifications.length === 0) {
      return { notifications: [], total: count || 0 };
    }

    // Enrich notifications with related data
    const enrichedNotifications: NotificationWithDetails[] = await Promise.all(
      paginatedNotifications.map(async (notif) => {
        const enriched: NotificationWithDetails = { ...notif } as NotificationWithDetails;

        // Fetch actor details if actor_user_id exists
        if (notif.actor_user_id) {
          try {
            // Try users table first, fallback to profiles
            let actorProfile = null;
            const { data: usersData, error: usersError } = await supabase
              .from('users')
              .select('name, avatar_url')
              .eq('user_id', notif.actor_user_id)
              .single();
            
            if (!usersError && usersData) {
              actorProfile = usersData;
            } else {
              // Fallback to profiles table
              const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('name, avatar_url')
                .eq('user_id', notif.actor_user_id)
                .single();
              
              if (!profilesError && profilesData) {
                actorProfile = profilesData;
              }
            }
            
            if (actorProfile) {
              enriched.actor_name = actorProfile.name;
              enriched.actor_avatar = actorProfile.avatar_url;
            }
          } catch (error) {
            // Silently fail - actor details are optional
            console.log('Could not fetch actor profile:', error);
          }
        }

        // Fetch review and event details if review_id exists
        if (notif.review_id) {
          const { data: review } = await supabase
            .from('user_reviews')
            .select('review_text, rating, event_id')
            .eq('id', notif.review_id)
            .single();
          
          if (review) {
            enriched.review_text = review.review_text;
            enriched.rating = review.rating;

            // Fetch event details
            if (review.event_id) {
              const { data: event } = await supabase
                .from('jambase_events')
                .select('title, artist_name, venue_name')
                .eq('id', review.event_id)
                .single();
              
              if (event) {
                enriched.event_title = event.title;
                enriched.artist_name = event.artist_name;
                enriched.venue_name = event.venue_name;
              }
            }
          }
        }

        return enriched;
      })
    );

    // Return the original database count to enable proper pagination
    // Note: This count includes processed friend requests that are filtered out client-side.
    // The returned array may contain fewer items than the total due to client-side filtering,
    // but the total count allows pagination UI to work correctly.
    return {
      notifications: enrichedNotifications,
      total: count || 0
    };
  }

  /**
   * Helper method to enrich a single notification with related data
   */
  private static async enrichNotification(notif: any): Promise<NotificationWithDetails> {
    const enriched: NotificationWithDetails = { ...notif } as NotificationWithDetails;

    // Fetch actor details if actor_user_id exists
    if (notif.actor_user_id) {
      try {
        // Try users table first, fallback to profiles
        let actorProfile = null;
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('name, avatar_url')
          .eq('user_id', notif.actor_user_id)
          .single();
        
        if (!usersError && usersData) {
          actorProfile = usersData;
        } else {
          // Fallback to profiles table
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('name, avatar_url')
            .eq('user_id', notif.actor_user_id)
            .single();
          
          if (!profilesError && profilesData) {
            actorProfile = profilesData;
          }
        }
        
        if (actorProfile) {
          enriched.actor_name = actorProfile.name;
          enriched.actor_avatar = actorProfile.avatar_url;
        }
      } catch (error) {
        // Silently fail - actor details are optional
        console.log('Could not fetch actor profile:', error);
      }
    }

    // Fetch review and event details if review_id exists
    if (notif.review_id) {
      const { data: review } = await supabase
        .from('user_reviews')
        .select('review_text, rating, event_id')
        .eq('id', notif.review_id)
        .single();
      
      if (review) {
        enriched.review_text = review.review_text;
        enriched.rating = review.rating;

        // Fetch event details
        if (review.event_id) {
          const { data: event } = await supabase
            .from('jambase_events')
            .select('title, artist_name, venue_name')
            .eq('id', review.event_id)
            .single();
          
          if (event) {
            enriched.event_title = event.title;
            enriched.artist_name = event.artist_name;
            enriched.venue_name = event.venue_name;
          }
        }
      }
    }

    return enriched;
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
          event_interest: 0,
          event_attendance_reminder: 0,
          artist_followed: 0,
          artist_new_event: 0,
          artist_profile_updated: 0,
          venue_new_event: 0,
          venue_profile_updated: 0,
          event_share: 0,
          friend_rsvp_going: 0,
          friend_rsvp_changed: 0,
          friend_review_posted: 0,
          friend_attended_same_event: 0,
          event_reminder: 0,
          group_chat_invite: 0,
          trending_in_network: 0,
          mutual_attendance: 0,
          flag_reviewed: 0,
          user_warned: 0,
          user_restricted: 0,
          user_suspended: 0
        } as Record<NotificationType, number>
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
   * Filters out processed friend request notifications to match getNotifications behavior
   */
  static async getUnreadCount(): Promise<number> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found, returning 0 unread count');
        return 0;
      }

      // Check cache
      const unreadCacheKey = `unread_count_${user.id}`;
      const cached = cacheService.get<number>(unreadCacheKey);
      if (cached !== null) {
        return cached;
      }

      // Fetch all unread notifications to filter out processed friend requests
      // This ensures the count matches what getNotifications returns
      const { data: notifications, error: fetchError } = await supabase
        .from('notifications')
        .select('id, type, data, is_read')
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (fetchError) {
        console.error('Error fetching notifications for unread count:', fetchError);
        return 0;
      }

      if (!notifications || notifications.length === 0) {
        return 0;
      }

      // Filter out processed friend request notifications (same logic as getNotifications)
      const friendRequestNotifications = notifications.filter(n => n.type === 'friend_request' && n.data?.request_id);
      
      let processedRequestIds: Set<string> = new Set();
      if (friendRequestNotifications.length > 0) {
        try {
          const requestIds = friendRequestNotifications.map(n => n.data.request_id).filter(Boolean);
          if (requestIds.length > 0) {
            // Get all non-pending requests in one query
            const { data: processedRequests } = await supabase
              .from('user_relationships')
              .select('id')
              .in('id', requestIds)
              .eq('relationship_type', 'friend')
              .neq('status', 'pending');
            
            if (processedRequests) {
              processedRequestIds = new Set(processedRequests.map(r => r.id));
            }
          }
        } catch (error: any) {
          // If batch query fails (RLS), skip filtering - include all notifications
          // This is expected with RLS restrictions, so don't log
        }
      }

      // Filter out processed friend request notifications
      const validNotifications = notifications.filter((notif) => {
        if (notif.type === 'friend_request' && notif.data?.request_id) {
          const requestId = notif.data.request_id;
          // Exclude if this is a processed friend request
          return !processedRequestIds.has(requestId);
        }
        return true; // Include all non-friend-request notifications
      });

      const count = validNotifications.length;
      
      // Cache the result
      cacheService.set(unreadCacheKey, count, CacheTTL.NOTIFICATIONS);
      
      return count;
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
  static async subscribeToNotifications(
    onNotification: (notification: NotificationWithDetails) => void,
    onUpdate: (notification: NotificationWithDetails) => void,
    onDelete: (notificationId: string) => void
  ) {
    // Get user ID first before setting up subscription
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('Cannot subscribe to notifications: User not authenticated');
      return null;
    }

    const userId = user.id;
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        async (payload) => {
          try {
            // Try to fetch from view first, fallback to manual enrichment
            let data: NotificationWithDetails | null = null;
            
            const { data: viewData, error: viewError } = await supabase
              .from('notifications_with_details')
              .select('*')
              .eq('id', payload.new.id)
              .single();

              // Check if view exists and data is available
            if (viewError) {
              // There's an error - check if it's a "view doesn't exist" error
              const viewErrorCode = viewError.code || (viewError as any)?.statusCode || (viewError as any)?.status;
              const viewErrorMessage = (viewError.message || String(viewError) || '').toLowerCase();
              
              // If it's a "view doesn't exist" error, we'll fallback below
              // Otherwise, it's a different error and we should still try fallback
              const isViewNotFound = 
                viewErrorCode === 'PGRST205' || 
                viewErrorCode === '42P01' ||
                viewErrorCode === 404 ||
                viewErrorCode === '404' ||
                String(viewErrorCode) === '404' ||
                (viewError as any)?.status === 404 ||
                (viewError as any)?.statusCode === 404 ||
                viewErrorMessage?.includes('notifications_with_details') ||
                viewErrorMessage?.includes('does not exist') ||
                viewErrorMessage?.includes('not found') ||
                viewErrorMessage?.includes('404');
              
              // If it's not a "view doesn't exist" error, log it but still fallback
              if (!isViewNotFound) {
                console.warn('Unexpected error fetching from notifications_with_details view:', viewError);
              }
              // Fall through to fallback
            } else if (viewData) {
              // No error and we have data - use it
              data = viewData as NotificationWithDetails;
            }
            
            // Fallback: fetch from notifications table and enrich if view data not available
            if (!data) {
              const { data: notifData } = await supabase
                .from('notifications')
                .select('*')
                .eq('id', payload.new.id)
                .single();

              if (notifData) {
                const enriched = await this.enrichNotification(notifData as any);
                data = enriched;
              }
            }

            if (data) {
              onNotification(data);
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
          filter: `user_id=eq.${userId}`
        },
        async (payload) => {
          try {
            // Try to fetch from view first, fallback to manual enrichment
            let data: NotificationWithDetails | null = null;
            
            const { data: viewData, error: viewError } = await supabase
              .from('notifications_with_details')
              .select('*')
              .eq('id', payload.new.id)
              .single();

              // Check if view exists and data is available
            if (viewError) {
              // There's an error - check if it's a "view doesn't exist" error
              const viewErrorCode = viewError.code || (viewError as any)?.statusCode || (viewError as any)?.status;
              const viewErrorMessage = (viewError.message || String(viewError) || '').toLowerCase();
              
              // If it's a "view doesn't exist" error, we'll fallback below
              // Otherwise, it's a different error and we should still try fallback
              const isViewNotFound = 
                viewErrorCode === 'PGRST205' || 
                viewErrorCode === '42P01' ||
                viewErrorCode === 404 ||
                viewErrorCode === '404' ||
                String(viewErrorCode) === '404' ||
                (viewError as any)?.status === 404 ||
                (viewError as any)?.statusCode === 404 ||
                viewErrorMessage?.includes('notifications_with_details') ||
                viewErrorMessage?.includes('does not exist') ||
                viewErrorMessage?.includes('not found') ||
                viewErrorMessage?.includes('404');
              
              // If it's not a "view doesn't exist" error, log it but still fallback
              if (!isViewNotFound) {
                console.warn('Unexpected error fetching from notifications_with_details view:', viewError);
              }
              // Fall through to fallback
            } else if (viewData) {
              // No error and we have data - use it
              data = viewData as NotificationWithDetails;
            }
            
            // Fallback: fetch from notifications table and enrich if view data not available
            if (!data) {
              const { data: notifData } = await supabase
                .from('notifications')
                .select('*')
                .eq('id', payload.new.id)
                .single();

              if (notifData) {
                const enriched = await this.enrichNotification(notifData as any);
                data = enriched;
              }
            }

            if (data) {
              onUpdate(data);
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
          filter: `user_id=eq.${userId}`
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
      case 'event_attendance_reminder':
        return '📍';
      case 'artist_followed':
        return '🎤';
      case 'artist_new_event':
        return '🎸';
      case 'artist_profile_updated':
        return '✨';
      case 'venue_new_event':
        return '🏛️';
      case 'venue_profile_updated':
        return '🎭';
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
      case 'event_attendance_reminder':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'artist_followed':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'artist_new_event':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'artist_profile_updated':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'venue_new_event':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'venue_profile_updated':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
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

  /**
   * Handle attendance reminder notification action
   * Marks attendance for an event from a notification
   */
  static async handleAttendanceReminderAction(
    notificationId: string,
    eventId: string,
    attended: boolean
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Import dynamically to avoid circular dependencies
      const { UserEventService } = await import('./userEventService');
      
      // Mark the user's attendance
      await UserEventService.markUserAttendance(user.id, eventId, attended);

      // Mark the notification as read
      await this.markAsRead(notificationId);

      console.log(`✅ Attendance marked for event ${eventId}: ${attended ? 'attended' : 'did not attend'}`);
    } catch (error) {
      console.error('Error handling attendance reminder action:', error);
      throw new Error(`Failed to mark attendance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a notification requires action
   */
  static requiresAction(type: NotificationType): boolean {
    return [
      'friend_request',
      'event_attendance_reminder'
    ].includes(type);
  }

  /**
   * Get action buttons for a notification
   */
  static getNotificationActions(type: NotificationType): Array<{
    label: string;
    action: 'accept' | 'decline' | 'attended' | 'not_attended' | 'dismiss';
    variant?: 'primary' | 'secondary' | 'success' | 'danger';
  }> {
    switch (type) {
      case 'friend_request':
        return [
          { label: 'Accept', action: 'accept', variant: 'success' },
          { label: 'Decline', action: 'decline', variant: 'secondary' }
        ];
      case 'event_attendance_reminder':
        return [
          { label: 'Yes, I attended', action: 'attended', variant: 'primary' },
          { label: 'No, I didn\'t go', action: 'not_attended', variant: 'secondary' },
          { label: 'Dismiss', action: 'dismiss', variant: 'secondary' }
        ];
      default:
        return [];
    }
  }
}
