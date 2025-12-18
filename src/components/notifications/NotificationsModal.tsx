import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bell, 
  CheckCheck, 
  Filter,
  RefreshCw,
  BellOff,
  Settings
} from 'lucide-react';
import { NotificationItem } from './NotificationItem';
import { NotificationService } from '@/services/notificationService';
import { useToast } from '@/hooks/use-toast';
import type { NotificationWithDetails, NotificationType } from '@/types/notifications';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewReview?: (reviewId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onViewReview,
  onViewProfile
}) => {
  const [notifications, setNotifications] = useState<NotificationWithDetails[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');
  const { toast } = useToast();

  // Load notifications
  const loadNotifications = async () => {
    setLoading(true);
    try {
      const filters = {
        is_read: activeTab === 'unread' ? false : undefined,
        type: filterType === 'all' ? undefined : filterType,
        limit: 50
      };

      const result = await NotificationService.getNotifications(filters);
      setNotifications(result.notifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast({
        title: "Error",
        description: "Failed to load notifications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load unread count
  const loadUnreadCount = async () => {
    try {
      const count = await NotificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  // Load data when modal opens or filters change - parallelize queries
  useEffect(() => {
    if (isOpen) {
      // Parallelize notification and unread count loading
      Promise.all([
        loadNotifications(),
        loadUnreadCount()
      ]).catch(err => console.error('Error loading notifications:', err));
    }
  }, [isOpen, activeTab, filterType]);

  // Handle mark as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      toast({
        title: "Notification marked as read",
        description: "The notification has been marked as read",
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      
      // Refresh notifications to get updated state from server
      await loadNotifications();
      await loadUnreadCount();
      
      toast({
        title: "All notifications marked as read",
        description: "All notifications have been marked as read",
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

  // Handle refresh
  const handleRefresh = () => {
    loadNotifications();
    loadUnreadCount();
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const hasUnread = unreadNotifications.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unreadCount}
                </Badge>
              )}
            </DialogTitle>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              
              {hasUnread && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'unread')}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                All ({notifications.length})
              </TabsTrigger>
              <TabsTrigger value="unread" className="flex items-center gap-2">
                <BellOff className="w-4 h-4" />
                Unread ({unreadNotifications.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              <ScrollArea className="h-[400px]">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading notifications...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {activeTab === 'unread' ? 'No unread notifications' : 'No notifications'}
                    </h3>
                    <p className="text-gray-600">
                      {activeTab === 'unread' 
                        ? 'You\'re all caught up!' 
                        : 'You\'ll see notifications here when people interact with your content.'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        onViewReview={onViewReview}
                        onViewProfile={onViewProfile}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
