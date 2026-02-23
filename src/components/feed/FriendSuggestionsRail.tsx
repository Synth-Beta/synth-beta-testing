import React, { useState, useEffect } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { X, UserPlus, Check, Verified } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { SkeletonFriendCard } from '@/components/skeleton/SkeletonFriendCard';
import { hapticLight } from '@/utils/haptics';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';

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
  // Users to exclude from the list: already friends or pending (sent or received)
  const [excludedUserIds, setExcludedUserIds] = useState<Set<string>>(new Set());
  // Don't render until we've checked exclusions - prevents flash of wrong content (e.g. showing
  // someone you've already requested, then changing after the async check completes)
  const [exclusionsLoaded, setExclusionsLoaded] = useState(false);
  // Track sent state: shows "Sent ✓" button while card is still visible
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());
  // Track cards currently playing their fade-out animation before DOM removal
  const [removingUserIds, setRemovingUserIds] = useState<Set<string>>(new Set());

  // Check for existing relationships (pending or accepted) on mount and when suggestions change
  useEffect(() => {
    if (suggestions.length === 0) {
      setExclusionsLoaded(true);
      return;
    }
    setExclusionsLoaded(false);

    const checkExistingRelationships = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setExclusionsLoaded(true);
          return;
        }

        const userIds = suggestions.map(s => s.user_id);

        // Exclude anyone we have any friend relationship with: pending (sent or received) or accepted
        const { data: sent, error: sentError } = await supabase
          .from('user_relationships')
          .select('related_user_id')
          .eq('user_id', user.id)
          .eq('relationship_type', 'friend')
          .in('status', ['pending', 'accepted'])
          .in('related_user_id', userIds);

        if (sentError) {
          console.error('Error checking sent friend relationships:', sentError);
        }

        const { data: received, error: receivedError } = await supabase
          .from('user_relationships')
          .select('user_id')
          .eq('related_user_id', user.id)
          .eq('relationship_type', 'friend')
          .in('status', ['pending', 'accepted'])
          .in('user_id', userIds);

        if (receivedError) {
          console.error('Error checking received friend relationships:', receivedError);
        }

        const excluded = new Set<string>();
        if (sent) sent.forEach(r => excluded.add(r.related_user_id));
        if (received) received.forEach(r => excluded.add(r.user_id));

        setExcludedUserIds(excluded);
      } catch (error) {
        console.error('Error checking friend relationships:', error);
      } finally {
        setExclusionsLoaded(true);
      }
    };

    checkExistingRelationships();
  }, [suggestions]);

  const handleAddFriend = (userId: string) => {
    if (excludedUserIds.has(userId) || sentUserIds.has(userId)) return;

    hapticLight();

    // Fire the request optimistically — don't block the animation on the network call
    if (onAddFriend) {
      onAddFriend(userId).catch((error: any) => {
        console.error('Error sending friend request:', error);
      });
    }

    // Immediately show "Sent ✓" state on the button
    setSentUserIds(prev => new Set(prev).add(userId));

    // After 1.2s of "Sent ✓", begin the fade-out animation
    setTimeout(() => {
      setRemovingUserIds(prev => new Set(prev).add(userId));
      // After the 300ms CSS transition completes, remove the card from the DOM
      setTimeout(() => {
        setExcludedUserIds(prev => new Set(prev).add(userId));
      }, 300);
    }, 1200);
  };

  const visibleSuggestions = suggestions.filter(s => !excludedUserIds.has(s.user_id));

  // While loading exclusions, show skeleton placeholders
  if (!exclusionsLoaded) {
    return (
      <div className="mb-6 flex w-full flex-col items-center" style={{ marginTop: 12 }}>
        <div className="flex items-center mb-3 px-1 w-full justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-synth-black">Who You Should Know</h2>
            <p className="text-sm text-synth-black/60">People you may know</p>
          </div>
        </div>
        <div className="flex gap-3 px-1 pb-4 pt-1 overflow-hidden w-full justify-center">
          <SkeletonFriendCard />
          <SkeletonFriendCard />
          <SkeletonFriendCard />
        </div>
      </div>
    );
  }

  // Nothing to show once exclusions are loaded
  if (visibleSuggestions.length === 0) {
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

  return (
    <div
      className="mb-6 flex w-full flex-col items-center"
      style={{ marginTop: 12 }}
    >
      {/* Section title */}
      <div className={cn(
        "flex items-center mb-3 px-1 w-full",
        onDismiss ? "justify-between" : "justify-center"
      )}>
        <div className={onDismiss ? undefined : "text-center"}>
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
        <div className="flex justify-center space-x-3 pb-4 pt-1">
          {visibleSuggestions.map((suggestion) => {
            const isSent = sentUserIds.has(suggestion.user_id);
            const isRemoving = removingUserIds.has(suggestion.user_id);

            return (
              <div
                key={suggestion.user_id}
                className={cn(
                  // Layout
                  "flex flex-col items-center min-w-[148px] max-w-[148px]",
                  // Card styling
                  "rounded-2xl bg-gradient-to-b from-white to-pink-50/40",
                  "border border-pink-100/50 shadow-sm px-3 pt-3 pb-2",
                  // Interaction
                  "group cursor-pointer select-none",
                  "active:scale-[0.97] transition-all duration-300 ease-out",
                  // Removal animation
                  isRemoving && "opacity-0 scale-95 pointer-events-none"
                )}
                onClick={() => onUserClick?.(suggestion.user_id)}
              >
                {/* Avatar */}
                <div className="relative mb-2 mt-1">
                  <Avatar className={cn(
                    "h-20 w-20 ring-2 transition-all duration-300 overflow-hidden",
                    isSent
                      ? "ring-green-400/60"
                      : "ring-synth-pink/30 group-hover:ring-synth-pink/60"
                  )}>
                    {suggestion.avatar_url ? (
                      <ProgressiveImage
                        src={suggestion.avatar_url}
                        alt={suggestion.name}
                        className="h-20 w-20 rounded-full"
                      />
                    ) : (
                      <AvatarFallback className="bg-synth-pink/10 text-synth-pink text-base">
                        {getInitials(suggestion.name)}
                      </AvatarFallback>
                    )}
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
                <div
                  className="text-center space-y-0.5"
                  style={{
                    fontSize: 'var(--typography-meta-size)',
                    fontWeight: 'var(--typography-meta-weight)',
                    lineHeight: 'var(--typography-meta-line-height)',
                    color: 'var(--neutral-600)',
                  }}
                >
                  {(() => {
                    const mutualText =
                      suggestion.mutual_friends_count > 0
                        ? `${suggestion.mutual_friends_count} mutual friend${suggestion.mutual_friends_count !== 1 ? 's' : ''}`
                        : '';
                    const sharedGenresCount = suggestion.shared_genres_count ?? 0;
                    const sharedText =
                      sharedGenresCount > 0
                        ? `${sharedGenresCount} shared genre${sharedGenresCount !== 1 ? 's' : ''}`
                        : '';

                    const metaPStyle: React.CSSProperties = {
                      margin: 0,
                      fontSize: 'var(--typography-meta-size)',
                      fontWeight: 'var(--typography-meta-weight)',
                      lineHeight: 'var(--typography-meta-line-height)',
                      color: 'var(--neutral-600)',
                    };

                    // Always reserve space for 2 lines so the Add buttons align across cards.
                    return (
                      <>
                        <div
                          style={{
                            ...metaPStyle,
                            // Reserve exactly 2 lines of height (top-aligned), clamp longer text.
                            minHeight: '2lh',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {mutualText || '\u00A0'}
                        </div>
                        <p
                          style={{
                            ...metaPStyle,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {sharedText || '\u00A0'}
                        </p>
                      </>
                    );
                  })()}
                </div>

                {/* Add friend button */}
                {onAddFriend && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "mt-2 h-7 text-xs w-full transition-colors duration-200",
                      isSent && "border-green-500 bg-green-50 text-green-600 hover:bg-green-50 hover:text-green-600 hover:border-green-500"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddFriend(suggestion.user_id);
                    }}
                    disabled={isSent}
                  >
                    {isSent ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Sent
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
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};
