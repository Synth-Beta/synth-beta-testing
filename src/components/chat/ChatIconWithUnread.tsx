import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface ChatIconWithUnreadProps {
  onClick?: () => void;
  className?: string;
}

export function ChatIconWithUnread({ onClick, className }: ChatIconWithUnreadProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let channel: any = null;

    const loadUnreadCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        // Get total unread messages across all chats
        // Using RPC function if available, otherwise direct query
        const { data, error } = await supabase.rpc('get_unread_message_count', {
          user_id: user.id
        });

        if (error) {
          // Fallback: query unread messages directly
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .neq('sender_id', user.id)
            .not('sender_id', 'is', null);
          
          setUnreadCount(count || 0);
        } else {
          setUnreadCount(data || 0);
        }
      } catch (error) {
        console.error('Error loading unread chat count:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const setupRealtimeSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Subscribe to message changes
        channel = supabase
          .channel('chat-unread-count')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages'
            },
            () => {
              // Refresh count when messages change
              loadUnreadCount();
            }
          )
          .subscribe();
      } catch (error) {
        console.error('Error setting up chat subscription:', error);
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

