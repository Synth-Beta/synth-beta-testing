/**
 * Notifications Component
 * Shows user notifications with real-time updates
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Heart, MessageCircle, UserPlus, X } from 'lucide-react';
import MatchingService from '@/services/matchingService';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  is_read: boolean;
  created_at: string;
  actor_profile?: {
    name: string;
    avatar_url?: string;
  };
}

export function NotificationsList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const notificationsData = await MatchingService.getNotifications(50);
      setNotifications(notificationsData);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const count = await MatchingService.getUnreadNotificationCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await MatchingService.markNotificationRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'match':
        return <Heart className="h-5 w-5 text-pink-500" />;
      case 'message':
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case 'friend_request':
        return <UserPlus className="h-5 w-5 text-green-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="px-2 py-1">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        <p className="text-gray-600">Stay updated on your matches and activity</p>
      </div>

      {notifications.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Bell className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Notifications</h3>
            <p className="text-gray-600 text-sm">
              You'll see notifications here when you get matches or messages.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`cursor-pointer transition-colors ${
                !notification.is_read ? 'bg-purple-50 border-purple-200' : ''
              }`}
              onClick={() => !notification.is_read && markAsRead(notification.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`font-medium ${!notification.is_read ? 'text-purple-900' : 'text-gray-900'}`}>
                          {notification.title}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        
                        {/* Actor info */}
                        {notification.actor_profile && (
                          <div className="flex items-center gap-2 mt-2">
                            {notification.actor_profile.avatar_url ? (
                              <img 
                                src={notification.actor_profile.avatar_url} 
                                alt={notification.actor_profile.name}
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-gray-600">
                                  {notification.actor_profile.name?.charAt(0)}
                                </span>
                              </div>
                            )}
                            <span className="text-xs text-gray-500">
                              {notification.actor_profile.name}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
