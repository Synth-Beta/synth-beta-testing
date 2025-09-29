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

interface Notification {
  id: string;
  type: 'friend_request' | 'event_interest' | 'review_like' | 'review_comment' | 'event_reminder';
  title: string;
  message: string;
  user_id?: string;
  event_id?: string;
  review_id?: string;
  is_read: boolean;
  created_at: string;
  data?: any;
}

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
      // Fetch notifications from the database
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const notificationList = data || [];
      setNotifications(notificationList);
      setUnreadCount(notificationList.filter(n => !n.is_read).length);
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
                            <Button size="sm" variant="outline" className="h-6 px-2">
                              <Check className="w-3 h-3 mr-1" />
                              Accept
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2">
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
