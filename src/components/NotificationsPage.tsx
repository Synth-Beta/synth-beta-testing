import React, { useState, useEffect } from 'react';
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
  ArrowLeft,
  Check,
  X,
  ChevronLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { NotificationService } from '@/services/notificationService';
import type { NotificationWithDetails } from '@/types/notifications';
import { useViewTracking } from '@/hooks/useViewTracking';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import { 
  iosHeader, 
  iosIconButton,
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
  filter?: 'friends_only' | 'exclude_friends';
}

export const NotificationsPage = ({ 
  currentUserId, 
  onBack,
  onNavigateToProfile,
  onNavigateToEvent,
  onNavigateToArtist,
  onNavigateToVenue,
  filter,
}: NotificationsPageProps) => {
  // Track notifications view
  useViewTracking('view', 'notifications', { source: 'notifications' });

  const [notifications, setNotifications] = useState<NotificationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();
  const { sessionExpired } = useAuth();

  useEffect(() => {
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    fetchNotifications();
  }, [currentUserId, sessionExpired, filter]);

  const fetchNotifications = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired) {
        console.log('Session expired, skipping notifications fetch');
        setLoading(false);
        return;
      }

      // Parallelize notification and unread count queries
      const [result, count] = await Promise.all([
        NotificationService.getNotifications({ limit: 50 }),
        NotificationService.getUnreadCount()
      ]);
      
      // Apply filter based on prop
      let filteredNotifications = result.notifications;
      if (filter === 'friends_only') {
        filteredNotifications = result.notifications.filter(n => n.type === 'friend_request');
      } else if (filter === 'exclude_friends') {
        filteredNotifications = result.notifications.filter(n => n.type !== 'friend_request');
      }
      
      setNotifications(filteredNotifications);
      
      // Update unread count based on filter
      const filteredUnread = filteredNotifications.filter(n => !n.is_read).length;
      setUnreadCount(filteredUnread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: "Error",
        description: "Failed to load notifications. Please try again.",
        variant: "destructive",
      });
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId);

      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      
      // Refresh unread count
      const count = await NotificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  const markAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      
      // Refresh notifications to get updated state
      await fetchNotifications();
      
      toast({
        title: "All notifications marked as read",
        description: "You're all caught up!",
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read",
        variant: "destructive",
      });
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
      toast({
        title: "Error",
        description: "Invalid friend request. Please refresh and try again.",
        variant: "destructive",
      });
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
        console.error('Error accepting friend request:', error);
        
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
          
          toast({
            title: "Already Friends! ✅",
            description: "You're already friends with this person.",
          });
          return;
        }
        
        // Handle specific error cases - if already processed, just refresh and show success
        if (error.message?.includes('not found') || error.message?.includes('already processed')) {
          // Check if they're already friends (request was already accepted)
          const requestStatus = await checkFriendRequestStatus(requestId);
          if (requestStatus === 'accepted') {
            toast({
              title: "Already Friends! ✅",
              description: "You're already friends with this person.",
            });
          } else {
            toast({
              title: "Request Already Processed",
              description: "This friend request has already been handled.",
            });
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
      
      toast({
        title: "Friend Request Accepted! 🎉",
        description: "You're now friends!",
      });
    } catch (error: any) {
      console.error('Error accepting friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    console.log('❌ Declining friend request:', requestId);
    
    if (!requestId) {
      toast({
        title: "Error",
        description: "Invalid friend request. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

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
          toast({
            title: "Request Already Processed",
            description: "This friend request has already been handled.",
            variant: "destructive",
          });
          
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

      toast({
        title: "Friend Request Declined",
        description: "The friend request has been declined.",
      });
    } catch (error: any) {
      console.error('Error declining friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to decline friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4" />;
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
      case 'artist_profile_updated':
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
      case 'venue_profile_updated':
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

      case 'event_interest':
      case 'event_attendance_reminder':
      case 'event_reminder':
      case 'friend_rsvp_going':
      case 'friend_rsvp_changed':
      case 'friend_review_posted':
      case 'friend_attended_same_event':
        // Navigate to event
        if (data?.event_id && onNavigateToEvent) {
          onNavigateToEvent(data.event_id);
        } else if (notification.event_title) {
          // Try to find event by title or other identifier
          console.log('Navigate to event:', notification.event_title);
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
        text={filter === 'friends_only' ? 'Loading friend requests...' : 'Loading notifications...'}
      />
    );
  }

  return (
    <div 
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 1) 100%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'var(--spacing-bottom-nav, 80px)'
      }}
    >
      {/* iOS-style Header */}
      <div 
        style={{
          ...iosHeader,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <button
          onClick={onBack}
          style={{
            ...iosIconButton,
            width: 44,
            height: 44,
          }}
          aria-label="Back"
        >
          <ChevronLeft size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
          <h1 style={{
            ...textStyles.title1,
            color: 'var(--neutral-900)',
            margin: 0,
            fontWeight: 600,
          }}>
            {filter === 'friends_only' ? 'Friend Requests' : 'Notifications'}
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
        
        <div style={{ width: 44 }} /> {/* Spacer for centering */}
      </div>

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
              {filter === 'friends_only' ? 'No friend requests' : 'No notifications yet'}
            </h3>
            <p style={{
              ...textStyles.body,
              color: 'var(--neutral-600)',
            }}>
              {filter === 'friends_only' 
                ? "When someone sends you a friend request, it will appear here."
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
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
