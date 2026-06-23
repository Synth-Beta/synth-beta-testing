import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}