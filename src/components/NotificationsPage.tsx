import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  Bell, 
  Heart, 
  MessageCircle, 
  UserPlus, 
  Calendar, 
  Star,
  Users,
  Check,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { NotificationService } from '@/services/notificationService';
import type { NotificationWithDetails } from '@/types/notifications';
import { useViewTracking } from '@/hooks/useViewTracking';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import { MobileHeader } from '@/components/Header/MobileHeader';
import PageShell from '@/components/layout/PageShell';
import { 
  glassCard,
  glassCardLight,
  textStyles,
  animations
} from '@/styles/glassmorphism';


interface NotificationsPageProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToProfile?: (userId?: string, tab?: 'timeline' | 'interested') => void;
  onNavigateToEvent?: (eventId: string) => void;
  onNavigateToArtist?: (artistId: string) => void;
  onNavigateToVenue?: (venueName: string) => void;
  onNavigateToChat?: (chatId: string) => void;
  onNavigateToDiscover?: () => void;
  filter?: 'friends_only' | 'exclude_friends';
}

export const NotificationsPage = ({ 
  currentUserId, 
  onBack,
  onNavigateToProfile,
  onNavigateToEvent,
  onNavigateToArtist,
  onNavigateToVenue,
  onNavigateToChat,
  onNavigateToDiscover,
  filter,
}: NotificationsPageProps) => {
  // Track notifications view
  useViewTracking('view', 'notifications', { source: 'notifications' });

  const queryClient = useQueryClient();
  const { sessionExpired } = useAuth();

  const { data: notificationsData, isLoading: loading, refetch: fetchNotifications } = useQuery({
    queryKey: ['notifications', 'list', currentUserId, filter],
    queryFn: async () => {
      const [result] = await Promise.all([
        NotificationService.getNotifications({ limit: 50 }),
        NotificationService.getUnreadCount()
      ]);
      const nonChatNotifications = result.notifications.filter(
        n => n.type !== 'message' && n.type !== 'group_chat_invite'
      );
      let filtered = nonChatNotifications;
      const friendTypes = ['friend_request', 'friend_accepted'];
      if (filter === 'friends_only') {
        filtered = nonChatNotifications.filter(n => friendTypes.includes(n.type));
      } else if (filter === 'exclude_friends') {
        filtered = nonChatNotifications.filter(n => !friendTypes.includes(n.type));
      }

      // Auto-clean stale friend_request notifications where the request is no longer pending
      // (friendship was already accepted/declined via another path and the notification wasn't cleaned up)
      const friendRequestNotifs = filtered.filter(n => n.type === 'friend_request');
      if (friendRequestNotifs.length > 0) {
        const requestIds = friendRequestNotifs
          .map(n => (n.data as any)?.request_id)
          .filter(Boolean);

        if (requestIds.length > 0) {
          const { data: existingRequests } = await supabase
            .from('friend_requests')
            .select('id, status')
            .in('id', requestIds);

          const pendingIds = new Set(
            (existingRequests || []).filter(r => r.status === 'pending').map(r => r.id)
          );

          const staleNotifs = friendRequestNotifs.filter(n => {
            const reqId = (n.data as any)?.request_id;
            return !reqId || !pendingIds.has(reqId);
          });

          if (staleNotifs.length > 0) {
            // Silently delete stale notifications from DB
            await supabase
              .from('notifications')
              .delete()
              .in('id', staleNotifs.map(n => n.id));

            const staleIds = new Set(staleNotifs.map(n => n.id));
            filtered = filtered.filter(n => !staleIds.has(n.id));
          }
        }
      }

      return { notifications: filtered, unreadCount: filtered.filter(n => !n.is_read).length };
    },
    enabled: !!currentUserId && !sessionExpired,
    staleTime: 30 * 1000,
  });

  const notifications = notificationsData?.notifications ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const headerTitle = filter === 'friends_only' ? 'Friends' : 'Notifications';

  const markAsRead = async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId);
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list', currentUserId, filter] });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list', currentUserId, filter] });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const checkFriendRequestStatus = async (requestId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('status')
        .eq('id', requestId)
        .eq('relationship_type', 'friend')
        .single();

      if (error) {
        // If 406 or RLS error, try alternative approach
        // Check error message for 406 or RLS-related errors
        const errorMessage = error.message || '';
        if (error.code === 'PGRST301' || error.code === '42501' || errorMessage.includes('406') || errorMessage.includes('Not Acceptable')) {
          console.log('🔍 RLS restriction, cannot check status directly');
          
          // Try to find the notification to get the sender_id, then check if we're friends with that specific person
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Find the notification for this request to get the sender_id
            const { data: notification } = await supabase
              .from('notifications')
              .select('data')
              .eq('type', 'friend_request')
              .eq('user_id', user.id)
              .eq('data->>request_id', requestId)
              .single();
            
            if (notification?.data?.sender_id) {
              const senderId = notification.data.sender_id;
              
              // Check if there's an accepted friendship specifically with this sender
              // Query for relationships where current user is involved
              const { data: friendships } = await supabase
                .from('user_relationships')
                .select('user_id, related_user_id, status')
                .eq('relationship_type', 'friend')
                .eq('status', 'accepted')
                .or(`user_id.eq.${user.id},related_user_id.eq.${user.id}`);
              
              // Filter to find the specific friendship with the sender
              if (friendships && friendships.length > 0) {
                const friendshipWithSender = friendships.find(f => 
                  (f.user_id === user.id && f.related_user_id === senderId) ||
                  (f.user_id === senderId && f.related_user_id === user.id)
                );
                
                if (friendshipWithSender) {
                  return 'accepted';
                }
              }
            }
          }
          return 'unknown'; // Can't determine
        }
        console.log('🔍 Request not found:', error);
        return 'not_found';
      }

      return data?.status || 'not_found';
    } catch (error) {
      console.error('Error checking friend request status:', error);
      return 'not_found';
    }
  };

  const deleteFriendRequestNotification = async (requestId: string): Promise<void> => {
    try {
      // First, find all friend request notifications for this user
      const { data: notifications, error: fetchError } = await supabase
        .from('notifications')
        .select('id, data')
        .eq('type', 'friend_request')
        .eq('user_id', currentUserId);

      if (fetchError) {
        console.error('Could not fetch notifications for deletion:', fetchError);
        throw new Error(`Failed to fetch notifications: ${fetchError.message}`);
      }

      // Find the notification(s) with matching request_id
      // Check for null/undefined explicitly to avoid String(undefined) === String("undefined") bug
      const matchingNotifications = notifications?.filter(n => {
        const notifRequestId = (n.data as any)?.request_id;
        // Explicitly check for null/undefined before string conversion
        if (notifRequestId == null || requestId == null) {
          return notifRequestId === requestId; // Both must be null/undefined to match
        }
        return String(notifRequestId) === String(requestId);
      }) || [];

      if (matchingNotifications.length === 0) {
        // No matching notification found - this is not necessarily an error
        // (notification may have already been deleted or never existed)
        console.log('No matching notification found to delete');
        return;
      }

      // Delete all matching notifications
      // Include user_id in WHERE clause to ensure RLS policies are satisfied
      const notificationIds = matchingNotifications.map(n => n.id);
      const { error } = await supabase
        .from('notifications')
        .delete()
        .in('id', notificationIds)
        .eq('user_id', currentUserId);

      if (error) {
        console.error('Could not delete notification:', error);
        throw new Error(`Failed to delete notification: ${error.message}`);
      } else {
        console.log(`✅ Deleted ${notificationIds.length} friend request notification(s)`);
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      // Re-throw the error so callers can handle it appropriately
      throw error;
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    console.log('🤝 Accepting friend request:', requestId);
    
    if (!requestId) {
      return;
    }

    try {
      // Convert string to UUID if needed
      const uuidRequestId = typeof requestId === 'string' ? requestId : String(requestId);
      console.log('🤝 Converted request ID:', uuidRequestId);

      const { error } = await supabase.rpc('accept_friend_request', {
        request_id: uuidRequestId
      });

      console.log('🤝 Accept friend request result:', error);

      if (error) {
        // Handle duplicate key error (23505) - friendship already exists, treat as success
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          console.log('✅ Friendship already exists, treating as success');
          // No need to update - the RPC function already handled it or the friendship already exists
          // The duplicate key error means the bidirectional friendship constraint was violated,
          // which indicates the friendship is already in the database
          
          // Remove from UI and refresh
          setNotifications(prev => prev.filter(n => {
            const notifRequestId = (n.data as any)?.request_id;
            // Use same matching logic as deleteFriendRequestNotification (lines 205-208)
            // Return true to KEEP notifications that DON'T match, false to REMOVE those that DO match
            if (notifRequestId == null || requestId == null) {
              return notifRequestId === requestId ? false : true; // If they match (both null), remove (return false)
            }
            return String(notifRequestId) !== String(requestId);
          }));
          
          try {
            await deleteFriendRequestNotification(requestId);
          } catch (deleteError) {
            console.error('Failed to delete notification, but continuing:', deleteError);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          await fetchNotifications();
          
          return;
        }
        
        // Handle specific error cases - if already processed, just refresh and show success
        if (error.message?.includes('not found') || error.message?.includes('already processed')) {
          // Check if they're already friends (request was already accepted)
          const requestStatus = await checkFriendRequestStatus(requestId);
          if (requestStatus === 'accepted') {
          }
          
          // Immediately remove from UI
          setNotifications(prev => prev.filter(n => {
            const notifRequestId = (n.data as any)?.request_id;
            // Check for null/undefined explicitly to avoid String(undefined) === String("undefined") bug
            if (notifRequestId == null || requestId == null) {
              return notifRequestId !== requestId; // Keep if they don't match (one is null, other isn't)
            }
            return String(notifRequestId) !== String(requestId);
          }));
          
          // Manually delete the notification if it still exists
          try {
            await deleteFriendRequestNotification(requestId);
          } catch (deleteError) {
            // If deletion fails, log but continue - notification is already removed from UI
            console.error('Failed to delete notification, but continuing:', deleteError);
          }
          
          // Small delay to ensure deletion completes, then refresh
          await new Promise(resolve => setTimeout(resolve, 500));
          await fetchNotifications();
          return;
        }

        console.error('Error accepting friend request:', error);
        throw error;
      }

      // Success - immediately remove from UI, then delete and refresh
      setNotifications(prev => prev.filter(n => {
        const notifRequestId = (n.data as any)?.request_id;
        // Check for null/undefined explicitly to avoid String(undefined) === String("undefined") bug
        if (notifRequestId == null || requestId == null) {
          return notifRequestId !== requestId; // Keep if they don't match (one is null, other isn't)
        }
        return String(notifRequestId) !== String(requestId);
      }));
      
      try {
        await deleteFriendRequestNotification(requestId);
      } catch (deleteError) {
        // If deletion fails, log but continue - notification is already removed from UI
        // The refresh will re-fetch, but we'll filter it out again if it still exists
        console.error('Failed to delete notification, but continuing:', deleteError);
      }
      
      // Small delay to ensure deletion completes, then refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchNotifications();
    } catch (error: any) {
      console.error('Error accepting friend request:', error);
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    console.log('❌ Declining friend request:', requestId);
    
    if (!requestId) return;

    console.log('🔍 Debug: Declining friend request with ID:', requestId);

    try {
      const { error } = await supabase.rpc('decline_friend_request', {
        request_id: requestId
      });

      console.log('❌ Decline friend request result:', error);

      if (error) {
        console.error('Error declining friend request:', error);
        
        // Handle specific error cases (use optional chaining for consistency)
        if (error.message?.includes('not found') || error.message?.includes('already processed')) {
          // Immediately remove from UI (consistent with handleAcceptFriendRequest)
          setNotifications(prev => prev.filter(n => {
            const notifRequestId = (n.data as any)?.request_id;
            // Check for null/undefined explicitly to avoid String(undefined) === String("undefined") bug
            if (notifRequestId == null || requestId == null) {
              return notifRequestId !== requestId; // Keep if they don't match (one is null, other isn't)
            }
            return String(notifRequestId) !== String(requestId);
          }));
          
          // Manually delete the notification if it still exists
          try {
            await deleteFriendRequestNotification(requestId);
          } catch (deleteError) {
            // If deletion fails, log but continue - notification is already removed from UI
            console.error('Failed to delete notification, but continuing:', deleteError);
          }
          
          // Small delay to ensure deletion completes, then refresh
          await new Promise(resolve => setTimeout(resolve, 500));
          await fetchNotifications();
          return;
        }
        
        throw error;
      }

      // Immediately remove from UI
      setNotifications(prev => prev.filter(n => {
        const notifRequestId = (n.data as any)?.request_id;
        // Check for null/undefined explicitly to avoid String(undefined) === String("undefined") bug
        if (notifRequestId == null || requestId == null) {
          return notifRequestId !== requestId; // Keep if they don't match (one is null, other isn't)
        }
        return String(notifRequestId) !== String(requestId);
      }));
      
      // Manually delete the notification and refresh
      try {
        await deleteFriendRequestNotification(requestId);
      } catch (deleteError) {
        // If deletion fails, log but continue - notification is already removed from UI
        // The refresh will re-fetch, but we'll filter it out again if it still exists
        console.error('Failed to delete notification, but continuing:', deleteError);
      }
      
      // Small delay to ensure deletion completes, then refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchNotifications();

    } catch (error: any) {
      console.error('Error declining friend request:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4" />;
      case 'friend_tagged_in_review':
        return <Users className="w-4 h-4" />;
      case 'event_interest':
        return <Heart className="w-4 h-4" />;
      case 'review_like':
        return <Star className="w-4 h-4" />;
      case 'review_comment':
        return <MessageCircle className="w-4 h-4" />;
      case 'event_reminder':
        return <Calendar className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'friend_request':
        return 'text-blue-600';
      case 'event_interest':
        return 'text-red-600';
      case 'review_like':
        return 'text-yellow-600';
      case 'review_comment':
        return 'text-green-600';
      case 'event_reminder':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const handleNotificationClick = async (notification: NotificationWithDetails) => {
    // Don't navigate for friend requests - they have Accept/Decline buttons
    if (notification.type === 'friend_request') {
      // Just mark as read, don't navigate
      await markAsRead(notification.id);
      return;
    }

    // Mark as read first (don't await, navigate immediately)
    markAsRead(notification.id);

    const data = notification.data as any;

    // Navigate based on notification type and available data
    switch (notification.type) {
      case 'artist_new_event':
        // Prioritize navigating to event if available (more specific)
        if (data?.event_id && onNavigateToEvent) {
          onNavigateToEvent(data.event_id);
        } else if (data?.artist_id && onNavigateToArtist) {
          // Navigate to artist page
          onNavigateToArtist(data.artist_id);
        } else if (notification.artist_name && onNavigateToArtist) {
          // Try to search for artist by name (fallback)
          // For now, navigate using the name as ID (route will handle lookup)
          onNavigateToArtist(notification.artist_name);
        }
        break;

      case 'venue_new_event':
        // Navigate to venue if venue name is available
        if (notification.venue_name && onNavigateToVenue) {
          onNavigateToVenue(notification.venue_name);
        } else if (data?.venue_name && onNavigateToVenue) {
          onNavigateToVenue(data.venue_name);
        }
        // If event_id is available, navigate to event instead
        if (data?.event_id && onNavigateToEvent) {
          onNavigateToEvent(data.event_id);
        }
        break;

      case 'friend_tagged_in_review':
        // Open review form with artist, venue, date, and friends pre-filled
        // Dispatch custom event that MainApp listens for to open EventReviewModal with prefill
        if (data?.artist_id && data?.venue_id && data?.event_date) {
          window.dispatchEvent(
            new CustomEvent('open-review-invite', {
              detail: {
                artist_id: data.artist_id,
                artist_name: data.artist_name,
                venue_id: data.venue_id,
                venue_name: data.venue_name,
                event_date: data.event_date,
                attendees: data.attendees,
                review_id: data.review_id,
              },
            })
          );
        }
        await markAsRead(notification.id);
        break;

      case 'event_interest':
      case 'event_attendance_reminder':
      case 'event_reminder':
      case 'friend_rsvp_going':
      case 'friend_rsvp_changed':
      case 'friend_review_posted':
      case 'friend_attended_same_event':
      case 'follows_new_events_summary':
      case 'friends_event_interest_summary':
      case 'bucket_list_new_events_summary':
        // Navigate to event or discover feed
        if (data?.event_id && onNavigateToEvent) {
          onNavigateToEvent(data.event_id);
        } else if (onNavigateToDiscover) {
          onNavigateToDiscover();
        } else if (notification.event_title) {
          console.log('Navigate to event:', notification.event_title);
        }
        break;

      case 'chat_message':
        // Navigate to chat
        if (data?.chat_id && onNavigateToChat) {
          onNavigateToChat(data.chat_id);
        }
        break;

      case 'friend_request':
      case 'friend_accepted':
        // Navigate to profile
        if (data?.sender_id && onNavigateToProfile) {
          onNavigateToProfile(data.sender_id);
        } else if (data?.friend_id && onNavigateToProfile) {
          onNavigateToProfile(data.friend_id);
        } else if (notification.actor_user_id && onNavigateToProfile) {
          onNavigateToProfile(notification.actor_user_id);
        }
        break;

      case 'review_liked':
      case 'review_commented':
      case 'comment_replied':
        // Navigate to event (reviews are associated with events)
        if (data?.event_id && onNavigateToEvent) {
          onNavigateToEvent(data.event_id);
        } else if (notification.review_id) {
          // Try to fetch review to get event_id
          try {
            const { data: reviewData } = await supabase
              .from('reviews')
              .select('event_id')
              .eq('id', notification.review_id)
              .single();
            
            if (reviewData?.event_id && onNavigateToEvent) {
              onNavigateToEvent(reviewData.event_id);
            }
          } catch (error) {
            console.error('Error fetching review event:', error);
          }
        }
        break;

      default:
        // For other types, just mark as read (handled above)
        break;
    }
  };

  if (loading) {
    return (
      <SynthLoadingScreen
        text={filter === 'friends_only' ? 'Loading friends...' : 'Loading notifications...'}
      />
    );
  }

  const notificationsHeader = (
    <MobileHeader
      alignLeft
      leftIcon="left"
      onLeftIconClick={onBack}
      rightButton={<div style={{ width: 44, height: 44 }} aria-hidden="true" />}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h1
          style={{
            ...textStyles.title1,
            color: 'var(--neutral-900)',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {headerTitle}
        </h1>
        {unreadCount > 0 && (
          <div
            style={{
              backgroundColor: '#EF4444',
              color: '#fff',
              borderRadius: 12,
              minWidth: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              paddingLeft: 6,
              paddingRight: 6,
              boxSizing: 'border-box',
              border: '2px solid #fff',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </div>
    </MobileHeader>
  );

  return (
    <PageShell
      header={notificationsHeader}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          margin: '0 auto',
          paddingTop: 'var(--spacing-small, 12px)',
        }}
      >
        {/* Content area with iOS padding */}
        <div style={{ padding: '16px' }}>
        {/* Actions */}
        {notifications.length > 0 && unreadCount > 0 && (
          <div style={{
            ...glassCardLight,
            padding: '12px 16px',
            marginBottom: 16,
          }}>
            <button
              onClick={markAllAsRead}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(204, 36, 134, 0.2)',
                borderRadius: 12,
                color: 'var(--brand-pink-500)',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-body-size, 16px)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: `all ${animations.standardDuration} ${animations.springTiming}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(204, 36, 134, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              <Check size={18} style={{ color: 'var(--brand-pink-500)' }} />
              <span>Mark all as read</span>
            </button>
          </div>
        )}

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div style={{
            ...glassCard,
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            {filter === 'friends_only' ? (
              <UserPlus size={48} style={{ color: 'var(--brand-pink-500)', margin: '0 auto 16px' }} />
            ) : (
              <Bell size={48} style={{ color: 'var(--brand-pink-500)', margin: '0 auto 16px' }} />
            )}
            <h3 style={{
              ...textStyles.title2,
              color: 'var(--neutral-900)',
              marginBottom: 8,
            }}>
              {filter === 'friends_only' ? 'No friend activity' : 'No notifications yet'}
            </h3>
            <p style={{
              ...textStyles.body,
              color: 'var(--neutral-600)',
            }}>
              {filter === 'friends_only' 
                ? "Friend requests and new friendships will appear here."
                : "When you get event updates or review activity, they'll appear here."
              }
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                style={{
                  ...glassCard,
                  padding: 16,
                  cursor: 'pointer',
                  border: !notification.is_read ? '1px solid rgba(204, 36, 134, 0.3)' : '1px solid rgba(255, 255, 255, 0.3)',
                  transition: `all ${animations.standardDuration} ${animations.springTiming}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `
                    0 8px 32px 0 rgba(0, 0, 0, 0.1),
                    inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
                    inset 0 -1px 0 0 rgba(0, 0, 0, 0.05)
                  `.trim();
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    background: 'rgba(204, 36, 134, 0.1)',
                    borderRadius: 10,
                    flexShrink: 0,
                  }}>
                    {React.cloneElement(getNotificationIcon(notification.type), {
                      style: { color: 'var(--brand-pink-500)', width: 20, height: 20 }
                    })}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <h4 style={{
                        ...textStyles.title3,
                        color: 'var(--neutral-900)',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {notification.title}
                      </h4>
                      {!notification.is_read && (
                        <div 
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: '#EF4444',
                            flexShrink: 0,
                            marginLeft: 8,
                            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
                          }}
                        />
                      )}
                    </div>
                    
                    <p style={{
                      ...textStyles.body,
                      color: 'var(--neutral-600)',
                      marginBottom: 8,
                    }}>
                      {notification.message}
                    </p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        ...textStyles.footnote,
                        color: 'var(--neutral-500)',
                        background: 'rgba(255, 255, 255, 0.6)',
                        padding: '4px 8px',
                        borderRadius: 6,
                      }}>
                        {formatTimeAgo(notification.created_at)}
                      </span>
                      
                      {notification.type === 'friend_request' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              await handleAcceptFriendRequest((notification.data as any)?.request_id);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              background: 'var(--brand-pink-500)',
                              color: '#fff',
                              borderRadius: 8,
                              border: 'none',
                              fontFamily: 'var(--font-family)',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <Check size={14} />
                            Accept
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              await handleDeclineFriendRequest((notification.data as any)?.request_id);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              background: 'rgba(255, 255, 255, 0.8)',
                              color: 'var(--neutral-700)',
                              borderRadius: 8,
                              border: '1px solid rgba(0, 0, 0, 0.1)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <X size={14} />
                            Decline
                          </button>
                        </div>
                      )}
                      {notification.type === 'friend_accepted' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const data = notification.data as any;
                              const friendId = data?.friend_id || data?.sender_id;
                              const friendName = data?.friend_name || notification.title?.replace("You're now friends with ", '').replace('!', '') || 'Friend';
                              if (friendId) {
                                window.dispatchEvent(new CustomEvent('open-friend-match', {
                                  detail: { friendId, friendName, notificationId: notification.id },
                                }));
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              background: 'var(--brand-pink-500)',
                              color: '#fff',
                              borderRadius: 8,
                              border: 'none',
                              fontFamily: 'var(--font-family)',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <Users size={14} />
                            View Match
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const data = notification.data as any;
                              const friendId = data?.friend_id || data?.sender_id || notification.actor_user_id;
                              if (friendId && onNavigateToProfile) {
                                onNavigateToProfile(friendId);
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              background: 'rgba(255, 255, 255, 0.8)',
                              color: 'var(--neutral-700)',
                              borderRadius: 8,
                              border: '1px solid rgba(0, 0, 0, 0.1)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <UserPlus size={14} />
                            View Profile
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </PageShell>
  );
};
