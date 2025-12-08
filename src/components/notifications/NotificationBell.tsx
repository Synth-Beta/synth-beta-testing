import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NotificationService } from '@/services/notificationService';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBell({ onClick, className }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let channel: any = null;

    const loadUnreadCount = async () => {
      try {
        const count = await NotificationService.getUnreadCount();
        console.log('🔔 NotificationBell: Unread count loaded:', count);
        setUnreadCount(count);
      } catch (error) {
        console.error('Error loading unread count:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const setupRealtimeSubscription = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error('Error getting user for notification subscription:', userError);
          setIsLoading(false);
          return;
        }

        // Subscribe to notification changes
        channel = supabase
          .channel('notification-bell')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`
            },
            (payload) => {
              console.log('🔔 NotificationBell: Notification change detected:', payload.eventType);
              // Refresh count when notifications change
              loadUnreadCount();
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('🔔 NotificationBell: Successfully subscribed to notifications');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('🔔 NotificationBell: Channel subscription error');
            }
          });
      } catch (error) {
        console.error('Error setting up notification subscription:', error);
        setIsLoading(false);
      }
    };

    loadUnreadCount();
    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <Button variant="outline" size="icon" className={cn("relative", className)} disabled>
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button 
      variant="outline" 
      size="icon" 
      className={cn("relative", className)}
      onClick={onClick}
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full p-0 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white border-0 shadow-sm z-10"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );
}