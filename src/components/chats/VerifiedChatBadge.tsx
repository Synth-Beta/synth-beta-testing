import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Users, Loader2 } from 'lucide-react';
import { VerifiedChatService, type EntityType, type VerifiedChatInfo } from '@/services/verifiedChatService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface VerifiedChatBadgeProps {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  currentUserId: string;
  onChatOpen?: (chatId: string) => void;
  className?: string;
  variant?: 'default' | 'compact';
}

export function VerifiedChatBadge({
  entityType,
  entityId,
  entityName,
  currentUserId,
  onChatOpen,
  className,
  variant = 'default',
}: VerifiedChatBadgeProps) {
  const [chatInfo, setChatInfo] = useState<VerifiedChatInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { toast } = useToast();

  // Load chat info on mount
  useEffect(() => {
    console.log('🟢 VerifiedChatBadge: Component mounted/updated', {
      entityType,
      entityId,
      entityName,
      currentUserId
    });
    loadChatInfo();
  }, [entityType, entityId, currentUserId]);

  const loadChatInfo = async () => {
    try {
      console.log('🟢 VerifiedChatBadge: Loading chat info...', { entityType, entityId, entityName });
      setIsLoading(true);
      
      // First, try to get existing chat info
      let info = await VerifiedChatService.getVerifiedChatInfo(entityType, entityId);
      console.log('🟢 VerifiedChatBadge: Initial chat info check:', info);
      
      // If chat doesn't exist, automatically create it
      if (!info || !info.chat_id) {
        console.log('🟢 VerifiedChatBadge: Chat does not exist, creating verified chat...');
        try {
          const chatId = await VerifiedChatService.getOrCreateVerifiedChat(
            entityType,
            entityId,
            entityName
          );
          console.log('🟢 VerifiedChatBadge: Verified chat created, chatId:', chatId);
          
          // Reload chat info to get full details
          info = await VerifiedChatService.getVerifiedChatInfo(entityType, entityId);
          console.log('🟢 VerifiedChatBadge: Chat info after creation:', info);
        } catch (createError) {
          console.error('❌ VerifiedChatBadge: Error creating verified chat:', createError);
          // Continue with null info - user can still click to create
        }
      }
      
      setChatInfo(info);
    } catch (error) {
      console.error('❌ VerifiedChatBadge: Error loading chat info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinOrOpen = async () => {
    console.log('🟢 VerifiedChatBadge: handleJoinOrOpen called', {
      entityType,
      entityId,
      entityName,
      currentUserId,
      hasOnChatOpen: !!onChatOpen
    });

    if (!currentUserId) {
      console.log('🟡 VerifiedChatBadge: No currentUserId, showing sign in toast');
      toast({
        title: 'Please sign in',
        description: 'You need to be signed in to join chats',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsJoining(true);
      console.log('🟢 VerifiedChatBadge: Calling joinOrOpenVerifiedChat...');
      const chatId = await VerifiedChatService.joinOrOpenVerifiedChat(
        entityType,
        entityId,
        entityName,
        currentUserId
      );
      console.log('🟢 VerifiedChatBadge: joinOrOpenVerifiedChat returned chatId:', chatId);

      // Reload chat info to get updated member count
      console.log('🟢 VerifiedChatBadge: Reloading chat info...');
      await loadChatInfo();
      console.log('🟢 VerifiedChatBadge: Chat info reloaded');

      if (onChatOpen) {
        console.log('🟢 VerifiedChatBadge: Calling onChatOpen callback with chatId:', chatId);
        onChatOpen(chatId);
      } else {
        console.log('🟢 VerifiedChatBadge: No onChatOpen callback, showing toast');
        toast({
          title: 'Chat opened',
          description: 'You can now participate in the chat',
        });
      }
      console.log('🟢 VerifiedChatBadge: handleJoinOrOpen completed successfully');
    } catch (error) {
      console.error('❌ VerifiedChatBadge: Error joining/opening chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to join chat. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsJoining(false);
    }
  };

  const getActivityText = (): string | null => {
    if (!chatInfo?.last_activity_at) return null;
    try {
      const activityDate = new Date(chatInfo.last_activity_at);
      return formatDistanceToNow(activityDate, { addSuffix: true });
    } catch {
      return null;
    }
  };

  const isActive = (): boolean => {
    if (!chatInfo?.last_activity_at) return false;
    try {
      const activityDate = new Date(chatInfo.last_activity_at);
      const hoursSinceActivity = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60);
      return hoursSinceActivity < 24; // Active if activity in last 24 hours
    } catch {
      return false;
    }
  };

  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleJoinOrOpen}
        disabled={isJoining || isLoading}
        className={cn('h-8 px-2', className)}
      >
        {isJoining || isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MessageSquare className="h-4 w-4" />
        )}
        {chatInfo?.member_count ? (
          <span className="ml-1 text-xs">{chatInfo.member_count}</span>
        ) : null}
      </Button>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isLoading ? (
        <Button variant="outline" size="sm" disabled>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading...
        </Button>
      ) : chatInfo?.chat_id ? (
        <div className="flex items-center gap-2">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: '25px',
              paddingLeft: 'var(--spacing-small, 12px)',
              paddingRight: 'var(--spacing-small, 12px)',
              borderRadius: 'var(--radius-corner, 10px)',
              backgroundColor: 'var(--neutral-100)',
              border: '2px solid var(--neutral-200)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              color: 'var(--neutral-900)',
              boxShadow: '0 4px 4px 0 var(--shadow-color)',
              gap: 'var(--spacing-inline, 6px)'
            }}
          >
            <MessageSquare size={19} style={{ color: 'var(--brand-pink-500)' }} />
            <span>
              {chatInfo.member_count || 0} {chatInfo.member_count === 1 ? 'member' : 'members'}
            </span>
            {isActive() && (
              <span style={{
                height: '6px',
                width: '6px',
                borderRadius: '50%',
                backgroundColor: '#2E8B63',
                flexShrink: 0
              }} title="Active" />
            )}
          </div>
          <Button
            variant={chatInfo.is_user_member ? 'default' : 'outline'}
            size="sm"
            onClick={handleJoinOrOpen}
            disabled={isJoining}
            className="h-8"
          >
            {isJoining ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Joining...
              </>
            ) : chatInfo.is_user_member ? (
              <>
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Open Chat
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Join Chat
              </>
            )}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleJoinOrOpen}
          disabled={isJoining}
          className="h-8"
        >
          {isJoining ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Creating...
            </>
          ) : (
            <>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Start Chat
            </>
          )}
        </Button>
      )}
      {chatInfo?.last_activity_at && getActivityText() && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {getActivityText()}
        </span>
      )}
    </div>
  );
}

