import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationsUnread, NOTIFICATIONS_UNREAD_QUERY_KEY } from '@/hooks/useNotificationsUnread';

interface NotificationBellProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBell({ onClick, className }: NotificationBellProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: unreadCount = 0, isLoading } = useNotificationsUnread(user?.id);

  useEffect(() => {
    if (!user?.id) return;
    let channel: any = null;

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
        () => {
          queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_UNREAD_QUERY_KEY, user.id] });
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

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
      {(unreadCount ?? 0) > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );
}