import React, { useState, useEffect } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { X, UserPlus, Verified, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface FriendSuggestion {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  verified?: boolean;
  connection_depth: number;
  mutual_friends_count: number;
  shared_genres_count?: number;
}

interface FriendSuggestionsRailProps {
  suggestions: FriendSuggestion[];
  onUserClick?: (userId: string) => void;
  onDismiss?: () => void;
  onAddFriend?: (userId: string) => Promise<void>;
}

export const FriendSuggestionsRail: React.FC<FriendSuggestionsRailProps> = ({
  suggestions,
  onUserClick,
  onDismiss,
  onAddFriend,
}) => {
  // Track which users have had friend requests sent (persist across reloads)
  const [requestedUserIds, setRequestedUserIds] = useState<Set<string>>(new Set());

  // Check for existing friend requests on mount and when suggestions change
  useEffect(() => {
    const checkExistingRequests = async () => {
      if (suggestions.length === 0) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const userIds = suggestions.map(s => s.user_id);
        
        // Check for pending friend requests in user_relationships table (3NF compliant)
        // Check both directions: where current user sent (user_id = current user) 
        // and where current user received (related_user_id = current user, user_id = suggested user)
        const { data: sentRequests, error: sentError } = await supabase
          .from('user_relationships')
          .select('related_user_id')
          .eq('user_id', user.id)
          .eq('relationship_type', 'friend')
          .eq('status', 'pending')
          .in('related_user_id', userIds);

        if (sentError) {
          console.error('Error checking sent friend requests:', sentError);
        }

        // Also check if any of these users sent requests to current user
        const { data: receivedRequests, error: receivedError } = await supabase
          .from('user_relationships')
          .select('user_id')
          .eq('related_user_id', user.id)
          .eq('relationship_type', 'friend')
          .eq('status', 'pending')
          .in('user_id', userIds);

        if (receivedError) {
          console.error('Error checking received friend requests:', receivedError);
        }

        // Combine both sets - we want to show "Requested" if we sent it OR if they sent it to us
        const requestedSet = new Set<string>();
        if (sentRequests) {
          sentRequests.forEach(r => requestedSet.add(r.related_user_id));
        }
        if (receivedRequests) {
          receivedRequests.forEach(r => requestedSet.add(r.user_id));
        }

        if (requestedSet.size > 0) {
          setRequestedUserIds(requestedSet);
        }
      } catch (error) {
        console.error('Error checking friend requests:', error);
      }
    };

    checkExistingRequests();
  }, [suggestions]);

  const handleAddFriend = async (userId: string) => {
    if (requestedUserIds.has(userId)) {
      return; // Already sent request
    }

    try {
      if (onAddFriend) {
        await onAddFriend(userId);
        // Mark as requested on success
        setRequestedUserIds(prev => new Set(prev).add(userId));
      }
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      // If error is "Friend request already sent", mark as requested anyway
      if (error?.message?.includes('already sent') || error?.message?.includes('Friend request already sent')) {
        setRequestedUserIds(prev => new Set(prev).add(userId));
      }
      // Don't mark as requested for other errors
    }
  };

  if (suggestions.length === 0) {
    return null;
  }

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getConnectionLabel = (depth: number): string => {
    switch (depth) {
      case 2:
        return 'Friend of a friend';
      case 3:
        return '2 mutual connections';
      default:
        return 'Connection';
    }
  };

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <h2 className="text-lg font-semibold text-synth-black">Who You Should Know</h2>
          <p className="text-sm text-synth-black/60">People you may know</p>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Horizontal Scrollable Rail */}
      <ScrollArea className="w-full">
        <div className="flex space-x-4 pb-4 pt-1">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.user_id}
              className="flex flex-col items-center min-w-[120px] max-w-[120px] group cursor-pointer"
              onClick={() => onUserClick?.(suggestion.user_id)}
            >
              {/* Avatar */}
              <div className="relative mb-2 mt-1">
                <Avatar className="h-16 w-16 ring-2 ring-synth-pink/20 group-hover:ring-synth-pink/40 transition-all">
                  <AvatarImage src={suggestion.avatar_url || undefined} alt={suggestion.name} />
                  <AvatarFallback className="bg-synth-pink/10 text-synth-pink">
                    {getInitials(suggestion.name)}
                  </AvatarFallback>
                </Avatar>
                {suggestion.verified && (
                  <div className="absolute -bottom-1 -right-1 bg-synth-pink rounded-full p-0.5">
                    <Verified className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>

              {/* Name */}
              <p className="text-sm font-medium text-synth-black text-center truncate w-full mb-1">
                {suggestion.name}
              </p>

              {/* Connection info */}
              <div className="text-xs text-synth-black/60 text-center space-y-0.5">
                {suggestion.mutual_friends_count > 0 && (
                  <p>{suggestion.mutual_friends_count} mutual friend{suggestion.mutual_friends_count !== 1 ? 's' : ''}</p>
                )}
                {(suggestion.shared_genres_count ?? 0) > 0 && (
                  <p>{suggestion.shared_genres_count} shared genre{suggestion.shared_genres_count !== 1 ? 's' : ''}</p>
                )}
              </div>

              {/* Add friend button */}
              {onAddFriend && (
                <Button
                  size="sm"
                  variant={requestedUserIds.has(suggestion.user_id) ? "outline" : "outline"}
                  className={cn(
                    "mt-2 h-7 text-xs w-full",
                    requestedUserIds.has(suggestion.user_id) && "border-synth-pink/30 bg-synth-pink/5"
                  )}
                  disabled={requestedUserIds.has(suggestion.user_id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddFriend(suggestion.user_id);
                  }}
                >
                  {requestedUserIds.has(suggestion.user_id) ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Requested
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3 w-3 mr-1" />
                      Add
                    </>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

