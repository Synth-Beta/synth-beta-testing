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
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { SynthSLogo } from '@/components/SynthSLogo';
import { NotificationService } from '@/services/notificationService';
import type { NotificationWithDetails } from '@/types/notifications';
import { SkeletonNotificationCard } from '@/components/skeleton/SkeletonNotificationCard';


interface NotificationsPageProps {
  currentUserId: string;
  onBack: () => void;
}

export const NotificationsPage = ({ currentUserId, onBack }: NotificationsPageProps) => {
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
  }, [currentUserId, sessionExpired]);

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
      
      setNotifications(result.notifications);
      setUnreadCount(count);
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
      const notificationIds = matchingNotifications.map(n => n.id);
      const { error } = await supabase
        .from('notifications')
        .delete()
        .in('id', notificationIds);

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

  if (loading) {
    return (
      <div className="min-h-screen synth-gradient-card p-4 pb-20">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header skeleton */}
          <div className="glass-card inner-glow text-center space-y-3 p-4 mb-6 floating-shadow">
            <div className="flex items-center justify-center gap-4">
              <SynthSLogo size="md" className="hover-icon animate-breathe" />
              <div className="h-8 bg-gray-200 rounded animate-pulse w-36"></div>
            </div>
          </div>

          {/* Notifications skeleton */}
          <div className="space-y-3">
            <SkeletonNotificationCard />
            <SkeletonNotificationCard />
            <SkeletonNotificationCard />
            <SkeletonNotificationCard />
            <SkeletonNotificationCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen synth-gradient-card p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass-card inner-glow text-center space-y-3 p-4 mb-6 floating-shadow">
          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack} className="hover-button absolute left-4">
              <ArrowLeft className="w-4 h-4 hover-icon" />
            </Button>
            <SynthSLogo size="md" className="hover-icon" />
            <h1 className="gradient-text text-2xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="default" className="gradient-badge">
                {unreadCount} unread
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        {notifications.length > 0 && unreadCount > 0 && (
          <div className="glass-card inner-glow p-4 mb-6 floating-shadow">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={markAllAsRead}
              className="hover-button w-full border-gray-200 hover:border-pink-400 hover:text-pink-500"
            >
              <Check className="w-4 h-4 mr-2 hover-icon" />
              Mark all as read
            </Button>
          </div>
        )}

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <Card className="glass-card inner-glow floating-shadow">
            <CardContent className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto mb-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
              <h3 className="text-lg font-semibold mb-2 gradient-text">No notifications yet</h3>
              <p className="text-gray-500">
                When you get friend requests, event updates, or review activity, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={`glass-card inner-glow hover-card cursor-pointer floating-shadow ${
                  !notification.is_read ? 'border-pink-300' : ''
                }`}
                onClick={() => markAsRead(notification.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 hover-icon">
                      {React.cloneElement(getNotificationIcon(notification.type), {
                        style: { background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
                      })}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-sm truncate gradient-text">
                          {notification.title}
                        </h4>
                        {!notification.is_read && (
                          <div className="w-2 h-2 gradient-badge rounded-full flex-shrink-0"></div>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 bg-white/30 px-2 py-1 rounded backdrop-blur-sm">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        
                        {notification.type === 'friend_request' && (
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="default" 
                              className="hover-button gradient-button h-6 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptFriendRequest((notification.data as any)?.request_id);
                              }}
                            >
                              <Check className="w-3 h-3 mr-1 hover-icon" />
                              Accept
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="hover-button h-6 px-2 border-gray-200 hover:border-red-400 hover:text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeclineFriendRequest((notification.data as any)?.request_id);
                              }}
                            >
                              <X className="w-3 h-3 mr-1 hover-icon" />
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
