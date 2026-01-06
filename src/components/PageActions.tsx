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
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadUnreadStatus = async () => {
      try {
        const { data: chats, error } = await fetchUserChats(currentUserId);

        if (error || cancelled || !chats) return;

        // Get user's last_read_at for each chat
        const { data: participantData } = await supabase
          .from('chat_participants')
          .select('chat_id, last_read_at')
          .eq('user_id', currentUserId);
        
        const lastReadMap = new Map<string, string | null>();
        participantData?.forEach(p => {
          lastReadMap.set(p.chat_id, p.last_read_at);
        });

        // Check if ANY chat has unread messages
        for (const chat of chats) {
          if (cancelled) break;

          const lastReadAt = lastReadMap.get(chat.id);
          
          const query = supabase
            .from('messages')
            .select('id')
            .eq('chat_id', chat.id)
            .neq('sender_id', currentUserId)
            .limit(1);
          
          if (lastReadAt) {
            query.gt('created_at', lastReadAt);
          }

          const { data: unreadMessage } = await query.maybeSingle();
          
          if (unreadMessage) {
            if (!cancelled) setHasUnread(true);
            return; // Found at least one unread, no need to check more
          }
        }

        if (!cancelled) setHasUnread(false);
      } catch (error) {
        console.error('Error loading unread status:', error);
      }
    };

    loadUnreadStatus();

    const channel = supabase
      .channel('page-actions-unread')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        loadUnreadStatus,
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
        {hasUnread && (
          <span className="absolute -top-1 -right-1 bg-synth-pink rounded-full h-3 w-3 shadow-lg shadow-synth-pink/30 animate-pulse" />
        )}
      </Button>
    </div>
  );
};
