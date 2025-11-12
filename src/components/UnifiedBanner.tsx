import React, { useState, useEffect } from 'react';
import { SynthSLogo } from '@/components/SynthSLogo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface UnifiedBannerProps {
  currentView: 'feed' | 'search' | 'profile';
  onViewChange: (view: 'feed' | 'search' | 'profile') => void;
  onNavigateToNotifications?: () => void;
  onNavigateToChat?: (userId: string) => void;
  currentUserId: string;
  className?: string;
}

export const UnifiedBanner: React.FC<UnifiedBannerProps> = ({
  currentView,
  onViewChange,
  onNavigateToNotifications,
  onNavigateToChat,
  currentUserId,
  className,
}) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        // Get all chats for the user
        const { data: chats, error } = await supabase.rpc('get_user_chats', {
          user_id: currentUserId
        });

        if (error) {
          console.error('Error fetching chats for unread count:', error);
          return;
        }

        // Calculate total unread messages across all chats
        // Only count chats that haven't been marked as read
        const readChats = JSON.parse(localStorage.getItem('read_chats') || '[]');
        let totalUnread = 0;
        
        for (const chat of chats || []) {
          // Skip if chat has been read
          if (readChats.includes(chat.id)) {
            continue;
          }

          try {
            // Get latest message to check if it's from current user
            const { data: latestMessage } = await supabase
              .from('messages')
              .select('sender_id')
              .eq('chat_id', chat.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // If latest message is from current user, no unread
            if (!latestMessage || latestMessage.sender_id === currentUserId) {
              continue;
            }

            // Count messages not sent by current user
            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('chat_id', chat.id)
              .neq('sender_id', currentUserId);
            
            totalUnread += count || 0;
          } catch (error) {
            console.error('Error counting unread for chat:', chat.id, error);
          }
        }

        setUnreadCount(totalUnread);
      } catch (error) {
        console.error('Error loading unread count:', error);
      }
    };

    loadUnreadCount();

    // Subscribe to message changes
    const channel = supabase
      .channel('banner-unread-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Spacer for balance */}
          <div className="w-20"></div>

          {/* Brand Section - Logo + Tagline (Centered) */}
          <div className="flex items-center gap-4 flex-1 justify-center">
            <SynthSLogo size="md" className="flex-shrink-0" />
            <div className="hidden sm:flex flex-col">
              <span className="text-lg font-bold text-foreground leading-tight">Synth</span>
              <span className="text-xs text-muted-foreground leading-tight font-normal">
                Discover • Connect • Share
              </span>
            </div>
          </div>

          {/* Actions - More Prominent */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-2 hover:bg-synth-pink/10 hover:border-synth-pink/50 transition-all"
              onClick={onNavigateToNotifications}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-2 hover:bg-synth-pink/10 hover:border-synth-pink/50 transition-all relative"
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
        </div>
      </div>
    </header>
  );
};

