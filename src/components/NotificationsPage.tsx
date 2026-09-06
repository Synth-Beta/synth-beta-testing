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
  ChevronLeft,
} from 'lucide-react';
import {
  acceptFriendRequest as acceptFriendRequestShared,
  declineFriendRequest as declineFriendRequestShared,
  deleteFriendRequestNotificationsByRequestId,
  isFriendsHubNotificationType,
} from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { NotificationService } from '@/services/notificationService';
import type { NotificationWithDetails } from '@/types/notifications';
import { useViewTracking } from '@/hooks/useViewTracking';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import PageShell from '@/components/layout/PageShell';


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
      const nonChatNotifications = result.notifications;
      let filtered = nonChatNotifications;
      if (filter === 'friends_only') {
        filtered = nonChatNotifications.filter(n => isFriendsHubNotificationType(n.type));
      } else if (filter === 'exclude_friends') {
        filtered = nonChatNotifications.filter(n => !isFriendsHubNotificationType(n.type));
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

          // Only delete when we can positively confirm the request is resolved — a missing
          // request_id (e.g. share-link referral notifications, which aren't tied to a formal
          // friend_requests row) must NOT be treated as stale, or it gets deleted before the
          // user ever sees it.
          const staleNotifs = friendRequestNotifs.filter(n => {
            const reqId = (n.data as any)?.request_id;
            return !!reqId && !pendingIds.has(reqId);
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

  const unreadQueryKey = ['notifications', 'unread', currentUserId];
  const listQueryKey = ['notifications', 'list', currentUserId, filter];

  // Read state is a local flag, so flip the cache before the network settles. Invalidating
  // alone left the cards looking unread for seconds: the unread badge refetches one cached
  // count, while this list's queryFn runs auth.getUser + two cleanup deletes + the select
  // back to back. Same invalidation still runs after, so the server stays the source of
  // truth and a failed write is corrected by the refetch.
  const revalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    queryClient.invalidateQueries({ queryKey: listQueryKey });
  };

  const markAsRead = async (notificationId: string) => {
    queryClient.setQueryData<typeof notificationsData>(listQueryKey, (old) =>
      old
        ? {
            ...old,
            notifications: old.notifications.map((n) =>
              n.id === notificationId ? { ...n, is_read: true } : n
            ),
            unreadCount: Math.max(0, old.unreadCount - (old.notifications.some((n) => n.id === notificationId && !n.is_read) ? 1 : 0)),
          }
        : old
    );
    try {
      await NotificationService.markAsRead(notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    } finally {
      revalidateNotifications();
    }
  };

  const markAllAsRead = async () => {
    queryClient.setQueryData<typeof notificationsData>(listQueryKey, (old) =>
      old
        ? { ...old, notifications: old.notifications.map((n) => ({ ...n, is_read: true })), unreadCount: 0 }
        : old
    );
    queryClient.setQueryData<number>(unreadQueryKey, 0);
    try {
      await NotificationService.markAllAsRead();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    } finally {
      revalidateNotifications();
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
    const { ok, error } = await deleteFriendRequestNotificationsByRequestId(
      supabase,
      currentUserId,
      requestId
    );
    if (!ok && error) {
      throw new Error(error);
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    if (!requestId) return;

    try {
      const uuidRequestId = typeof requestId === 'string' ? requestId : String(requestId);
      const result = await acceptFriendRequestShared(supabase, uuidRequestId);
      if (!result.ok) {
        console.error('Error accepting friend request:', result.error);
        return;
      }

      try {
        await deleteFriendRequestNotification(requestId);
      } catch (deleteError) {
        console.error('Failed to delete notification, but continuing:', deleteError);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchNotifications();
    } catch (error: any) {
      console.error('Error accepting friend request:', error);
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    if (!requestId) return;

    try {
      const result = await declineFriendRequestShared(supabase, requestId);
      if (!result.ok) {
        console.error('Error declining friend request:', result.error);
        return;
      }

      try {
        await deleteFriendRequestNotification(requestId);
      } catch (deleteError) {
        console.error('Failed to delete notification, but continuing:', deleteError);
      }

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
      case 'event_reminder_1_week':
      case 'event_reminder_3_days':
      case 'event_reminder_1_day':
        return <Calendar className="w-4 h-4" />;
      case 'event_reminder_day_after':
        return <Star className="w-4 h-4" />;
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
      case 'event_reminder_1_week':
      case 'event_reminder_3_days':
      case 'event_reminder_1_day':
        return 'text-purple-600';
      case 'event_reminder_day_after':
        return 'text-yellow-600';
      default:
        return 'var(--neutral-600)';
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

      case 'event_reminder_day_after': {
        // Only sent to users who RSVP'd going. Open the review composer prefilled
        // rather than the event page — the whole point is "how was it?".
        if (data?.event_id) {
          // send_event_reminders() COALESCEs venue_name down to 'Unknown Venue'
          // and artist to ''. EventReviewForm turns any truthy name without an id
          // into a `manual-` selection, so passing the sentinel through would
          // prefill (and let the user submit) a venue literally named
          // "Unknown Venue". Drop both placeholders instead.
          const venueName = data.event_venue || notification.venue_name;
          const artistName = data.event_artist || notification.artist_name;
          window.dispatchEvent(
            new CustomEvent('open-review-modal', {
              detail: {
                event: {
                  id: data.event_id,
                  title: data.event_title || notification.event_title,
                  artist_id: data.artist_id,
                  artist_name: artistName || undefined,
                  venue_id: data.venue_id,
                  venue_name:
                    venueName && venueName !== 'Unknown Venue' ? venueName : undefined,
                  event_date: data.event_date,
                },
              },
            })
          );
        } else if (onNavigateToDiscover) {
          onNavigateToDiscover();
        }
        break;
      }

      case 'event_interest':
      case 'event_attendance_reminder':
      case 'event_reminder':
      case 'event_reminder_1_week':
      case 'event_reminder_3_days':
      case 'event_reminder_1_day':
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

  return (
    <PageShell>
      <div
        style={{
          width: '100%',
          paddingTop: 'var(--spacing-small, 12px)',
        }}
      >
        {/* Content area with iOS padding */}
        <div style={{ padding: '16px' }}>
        {/* Page header — lives in the scrolling content instead of a separate fixed bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 'var(--spacing-grouped, 24px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                background: 'var(--gradient-brand, linear-gradient(135deg, #CC2486 0%, #8D1FF4 100%))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 3px 8px rgba(204, 36, 134, 0.3)',
              }}
            >
              {filter === 'friends_only' ? (
                <UserPlus size={19} style={{ color: '#fff' }} />
              ) : (
                <Bell size={19} style={{ color: '#fff' }} />
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-h1-size, 35px)',
                    fontWeight: 'var(--typography-h1-weight, 700)',
                    lineHeight: 'var(--typography-h1-line-height, 1.2)',
                    color: 'var(--neutral-900)',
                    margin: 0,
                  }}
                >
                  {headerTitle}
                </h1>
                {unreadCount > 0 && (
                  <div
                    style={{
                      backgroundColor: '#EF4444',
                      color: '#fff',
                      borderRadius: 999,
                      minWidth: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      paddingLeft: 6,
                      paddingRight: 6,
                      boxSizing: 'border-box',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </div>
                )}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 14,
                  color: 'var(--neutral-600)',
                  margin: '2px 0 0',
                }}
              >
                {filter === 'friends_only'
                  ? 'Friend requests and new friendships'
                  : 'Updates from friends and events you follow'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {notifications.length > 0 && unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)',
                  height: 'var(--size-button-height, 36px)',
                  padding: '0 var(--spacing-small, 12px)',
                  backgroundColor: 'var(--neutral-50)',
                  border: 'var(--border-brand)',
                  borderRadius: 'var(--radius-corner, 10px)',
                  color: 'var(--brand-pink-500)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 14,
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--brand-pink-050)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--neutral-50)';
                }}
              >
                <Check size={16} style={{ color: 'var(--brand-pink-500)' }} />
                <span>Mark all read</span>
              </button>
            )}

            <button
              onClick={onBack}
              type="button"
              aria-label="Back"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                flexShrink: 0,
                background: 'var(--neutral-50)',
                border: 'var(--border-default)',
                borderRadius: 'var(--radius-corner, 10px)',
                color: 'var(--neutral-900)',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--neutral-100)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--neutral-50)';
              }}
            >
              <ChevronLeft size={20} />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div style={{
            backgroundColor: 'var(--neutral-50)',
            border: 'var(--border-default)',
            borderRadius: 'var(--radius-corner, 10px)',
            boxShadow: 'var(--shadow-default)',
            padding: 'var(--spacing-big-section, 60px) var(--spacing-grouped, 24px)',
            textAlign: 'center',
          }}>
            {filter === 'friends_only' ? (
              <UserPlus size={48} style={{ color: 'var(--brand-pink-500)', margin: '0 auto 16px' }} />
            ) : (
              <Bell size={48} style={{ color: 'var(--brand-pink-500)', margin: '0 auto 16px' }} />
            )}
            <h3 style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)',
              margin: '0 0 var(--spacing-inline, 6px)',
            }}>
              {filter === 'friends_only' ? 'No friend activity' : 'No notifications yet'}
            </h3>
            <p style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              color: 'var(--neutral-600)',
              margin: 0,
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
                  backgroundColor: 'var(--neutral-50)',
                  border: !notification.is_read ? 'var(--border-brand)' : 'var(--border-default)',
                  borderRadius: 'var(--radius-corner, 10px)',
                  boxShadow: 'var(--shadow-default)',
                  padding: 'var(--spacing-small, 12px)',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--shadow-modal)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--shadow-default)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    backgroundColor: 'var(--brand-pink-050)',
                    borderRadius: 'var(--radius-corner, 10px)',
                    flexShrink: 0,
                  }}>
                    {React.cloneElement(getNotificationIcon(notification.type), {
                      style: { color: 'var(--brand-pink-500)', width: 20, height: 20 }
                    })}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <h4 style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 700,
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
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
                            backgroundColor: 'var(--status-error-500)',
                            flexShrink: 0,
                            marginLeft: 8,
                          }}
                        />
                      )}
                    </div>
                    
                    <p style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)',
                      margin: '0 0 var(--spacing-inline, 6px)',
                    }}>
                      {notification.message}
                    </p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--neutral-600)',
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
                              gap: 'var(--spacing-inline, 6px)',
                              height: 'var(--size-button-height, 36px)',
                              padding: '0 var(--spacing-small, 12px)',
                              backgroundColor: 'var(--brand-pink-500)',
                              color: 'var(--neutral-50)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              border: 'none',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
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
                              gap: 'var(--spacing-inline, 6px)',
                              height: 'var(--size-button-height, 36px)',
                              padding: '0 var(--spacing-small, 12px)',
                              backgroundColor: 'var(--neutral-50)',
                              color: 'var(--neutral-900)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              border: 'var(--border-default)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
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
                              gap: 'var(--spacing-inline, 6px)',
                              height: 'var(--size-button-height, 36px)',
                              padding: '0 var(--spacing-small, 12px)',
                              backgroundColor: 'var(--brand-pink-500)',
                              color: 'var(--neutral-50)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              border: 'none',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
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
                              gap: 'var(--spacing-inline, 6px)',
                              height: 'var(--size-button-height, 36px)',
                              padding: '0 var(--spacing-small, 12px)',
                              backgroundColor: 'var(--neutral-50)',
                              color: 'var(--neutral-900)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              border: 'var(--border-default)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
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
