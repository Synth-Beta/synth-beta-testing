import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { fetchUserChats } from '@/services/chatService';
import { NotificationBell } from '@/components/notifications/NotificationBell';

interface PageActionsProps {
  currentUserId: string;
  onNavigateToNotifications?: () => void;
  onNavigateToChat?: (userId: string) => void;
  className?: string;
}

export const PageActions: React.FC<PageActionsProps> = ({
  currentUserId,
  onNavigateToNotifications,
  onNavigateToChat,
  className,
}) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadUnreadCount = async () => {
      try {
        const { data: chats, error } = await fetchUserChats(currentUserId);

        if (error || cancelled || !chats) return;

        const readChats = JSON.parse(localStorage.getItem('read_chats') || '[]');
        let total = 0;

        for (const chat of chats) {
          if (cancelled || readChats.includes(chat.id)) continue;

          const { data: latest } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latest || latest.sender_id === currentUserId) continue;

          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .neq('sender_id', currentUserId);

          total += count || 0;
        }

        if (!cancelled) setUnreadCount(total);
      } catch (error) {
        console.error('Error loading unread count:', error);
      }
    };

    loadUnreadCount();

    const channel = supabase
      .channel('page-actions-unread')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        loadUnreadCount,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <NotificationBell
        onClick={onNavigateToNotifications}
        className="h-10 w-10 rounded-full border-2 hover:bg-synth-pink/10 hover:border-synth-pink/50 transition-colors"
      />
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10 rounded-full border-2 hover:bg-synth-pink/10 hover:border-synth-pink/50 transition-colors relative"
        onClick={() => onNavigateToChat?.(currentUserId)}
        aria-label="Open chat"
      >
        <MessageCircle className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
    </div>
  );
};
