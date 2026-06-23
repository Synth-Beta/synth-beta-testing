import React, { useEffect, useState, useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface ChatIconWithUnreadProps {
  onClick?: () => void;
  className?: string;
}

export function ChatIconWithUnread({ onClick, className }: ChatIconWithUnreadProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadUnreadCount = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      // Try RPC first (most accurate)
      const { data, error } = await supabase.rpc('get_unread_message_count', {
        user_id: user.id
      });

      if (!error && typeof data === 'number') {
        setUnreadCount(data);
        setIsLoading(false);
        return;
      }

      // Fallback: sum messages newer than last_read_at across all chats
      const { data: participants } = await supabase
        .from('chat_participants')
        .select('chat_id, last_read_at')
        .eq('user_id', user.id);

      if (!participants || participants.length === 0) {
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      let total = 0;
      for (const p of participants) {
        const lastRead = p.last_read_at || '1970-01-01';
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', p.chat_id)
          .neq('sender_id', user.id)
          .gt('created_at', lastRead);
        total += count || 0;
      }

      setUnreadCount(total);
    } catch (err) {
      console.error('Error loading unread chat count:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUnreadCount();

    let msgChannel: any = null;
    let participantChannel: any = null;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Refresh when new messages arrive
      msgChannel = supabase
        .channel('chat-icon-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
          loadUnreadCount();
        })
        .subscribe();

      // Refresh when any chat is marked as read (last_read_at updated)
      participantChannel = supabase
        .channel('chat-icon-participants')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${user.id}` },
          () => {
            loadUnreadCount();
          }
        )
        .subscribe();
    };

    setup();

    return () => {
      if (msgChannel) supabase.removeChannel(msgChannel);
      if (participantChannel) supabase.removeChannel(participantChannel);
    };
  }, [loadUnreadCount]);

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" className={className} disabled>
        <MessageCircle className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`relative ${className}`}
      onClick={onClick}
    >
      <MessageCircle className="h-5 w-5" />
      {unreadCount > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
