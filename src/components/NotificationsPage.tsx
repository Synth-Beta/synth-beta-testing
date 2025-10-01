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
import { fetchUserNotifications, type Notification } from '@/utils/notificationUtils';


interface NotificationsPageProps {
  currentUserId: string;
  onBack: () => void;
}

export const NotificationsPage = ({ currentUserId, onBack }: NotificationsPageProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
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

      // Use the utility function to fetch and filter notifications
      const activeNotifications = await fetchUserNotifications(currentUserId, 50);

      setNotifications(activeNotifications);
      setUnreadCount(activeNotifications.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      // Create some mock notifications for demo purposes
      const mockNotifications: Notification[] = [
        {
          id: '1',
          type: 'friend_request',
          title: 'New Friend Request',
          message: 'Sarah Johnson wants to be your friend',
          user_id: 'user123',
          is_read: false,
          created_at: new Date().toISOString(),
          data: {
            sender_id: 'user123',
            request_id: 'mock-request-123',
            sender_name: 'Sarah Johnson'
          }
        },
        {
          id: '2',
          type: 'event_interest',
          title: 'Event Interest',
          message: 'John liked the same event you\'re interested in: Cage The Elephant at Boeing Center',
          user_id: 'user456',
          event_id: 'event789',
          is_read: false,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '3',
          type: 'review_like',
          title: 'Review Liked',
          message: 'Mike liked your review of the Taylor Swift concert',
          user_id: 'user789',
          review_id: 'review123',
          is_read: true,
          created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: '4',
          type: 'event_reminder',
          title: 'Event Reminder',
          message: 'Cage The Elephant concert is tomorrow at 8:00 PM',
          event_id: 'event456',
          is_read: false,
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ];
      
      setNotifications(mockNotifications);
      setUnreadCount(mockNotifications.filter(n => !n.is_read).length);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      
      toast({
        title: "All notifications marked as read",
        description: "You're all caught up!",
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const checkFriendRequestStatus = async (requestId: string) => {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('status')
        .eq('id', requestId)
        .single();

      if (error) {
        console.log('🔍 Request not found:', error);
        return 'not_found';
      }

      return data?.status || 'not_found';
    } catch (error) {
      console.error('Error checking friend request status:', error);
      return 'not_found';
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

    // First check if the request is still valid
    const requestStatus = await checkFriendRequestStatus(requestId);
    console.log('🔍 Request status:', requestStatus);

    if (requestStatus === 'not_found' || requestStatus === 'accepted' || requestStatus === 'declined') {
      toast({
        title: "Request Already Processed",
        description: "This friend request has already been handled. Refreshing notifications...",
        variant: "destructive",
      });
      // Refresh notifications to remove the processed request
      fetchNotifications();
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
        
        // Handle specific error cases
        if (error.message.includes('not found') || error.message.includes('already processed')) {
          toast({
            title: "Request Already Processed",
            description: "This friend request has already been handled. Refreshing notifications...",
            variant: "destructive",
          });
          // Refresh notifications to remove the processed request
          fetchNotifications();
          return;
        }
        
        throw error;
      }

      // Remove the notification from UI immediately
      setNotifications(prev => prev.filter(n => (n.data as any)?.request_id !== requestId));
      
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

    // If no request ID provided, try to find it from friend_requests table
    let actualRequestId = requestId;
    if (!requestId) {
      console.log('🔍 Debug: No request ID provided, trying to find from friend_requests table');
      
      const { data: friendRequests, error: fetchError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .limit(1);

      if (fetchError) {
        console.error('Error fetching friend requests:', fetchError);
        throw new Error('Could not find friend request');
      }

      if (!friendRequests || friendRequests.length === 0) {
        throw new Error('No pending friend requests found');
      }

      actualRequestId = friendRequests[0].id;
    }

    try {
      const { error } = await supabase.rpc('decline_friend_request', {
        request_id: actualRequestId
      });

      console.log('❌ Decline friend request result:', error);

      if (error) {
        console.error('Error declining friend request:', error);
        
        // Handle specific error cases
        if (error.message.includes('not found') || error.message.includes('already processed')) {
          toast({
            title: "Request Already Processed",
            description: "This friend request has already been handled. Refreshing notifications...",
            variant: "destructive",
          });
          // Refresh notifications to remove the processed request
          fetchNotifications();
          return;
        }
        
        throw error;
      }

      // Remove the notification from UI immediately
      setNotifications(prev => prev.filter(n => (n.data as any)?.request_id !== requestId));

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen synth-gradient-card p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <SynthSLogo size="md" />
          <h1 className="synth-heading text-2xl">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {unreadCount} unread
            </Badge>
          )}
        </div>

        {/* Actions */}
        {notifications.length > 0 && unreadCount > 0 && (
          <div className="mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={markAllAsRead}
              className="w-full"
            >
              <Check className="w-4 h-4 mr-2" />
              Mark all as read
            </Button>
          </div>
        )}

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No notifications yet</h3>
              <p className="text-muted-foreground">
                When you get friend requests, event updates, or review activity, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={`cursor-pointer transition-colors ${
                  !notification.is_read ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                }`}
                onClick={() => markAsRead(notification.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 ${getNotificationColor(notification.type)}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-sm truncate">
                          {notification.title}
                        </h4>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        
                        {notification.type === 'friend_request' && (
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-6 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptFriendRequest((notification.data as any)?.request_id);
                              }}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Accept
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-6 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeclineFriendRequest((notification.data as any)?.request_id);
                              }}
                            >
                              <X className="w-3 h-3 mr-1" />
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
