import React, { useState, useEffect } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, UserPlus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
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
  /** 'rail' scrolls sideways inside the feed; 'list' stacks rows for the desktop side panel. */
  layout?: 'rail' | 'list';
}

/** How many suggestion cards to show at once; extras fill in when one is dismissed. */
const VISIBLE_SUGGESTION_COUNT = 5;

export const FriendSuggestionsRail: React.FC<FriendSuggestionsRailProps> = ({
  suggestions,
  onUserClick,
  onDismiss,
  onAddFriend,
  layout = 'rail',
}) => {
  const isList = layout === 'list';
  // Users to exclude from the list: already friends or pending (sent or received)
  const [excludedUserIds, setExcludedUserIds] = useState<Set<string>>(new Set());
  // Don't render until we've checked exclusions - prevents flash of wrong content (e.g. showing
  // someone you've already requested, then changing after the async check completes)
  const [exclusionsLoaded, setExclusionsLoaded] = useState(false);
  // Track sent state: shows "Sent ✓" button while card is still visible
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());
  // Track cards currently playing their fade-out animation before DOM removal
  const [removingUserIds, setRemovingUserIds] = useState<Set<string>>(new Set());
  // Dismissed via the card X — kept separate so a suggestions refresh doesn't bring them back
  const [dismissedUserIds, setDismissedUserIds] = useState<Set<string>>(new Set());

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

  const handleDismissSuggestion = (userId: string) => {
    if (dismissedUserIds.has(userId) || removingUserIds.has(userId)) return;

    hapticLight();
    setRemovingUserIds(prev => new Set(prev).add(userId));
    setTimeout(() => {
      setDismissedUserIds(prev => new Set(prev).add(userId));
    }, 300);
  };

  const visibleSuggestions = suggestions
    .filter(s => !excludedUserIds.has(s.user_id) && !dismissedUserIds.has(s.user_id))
    .slice(0, VISIBLE_SUGGESTION_COUNT);

  // While loading exclusions, show skeletons the size of the real cards
  if (!exclusionsLoaded) {
    return (
      <div className="flex w-full flex-col" aria-busy="true">
        <h2 className={cn('pb-2 text-[13px] font-semibold text-[var(--neutral-600)]', isList ? 'px-3' : 'px-4')}>People you may know</h2>
        <div className={cn('flex gap-2 overflow-hidden', isList ? 'flex-col' : 'px-4 pb-3')}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={cn(
                'flex h-16 shrink-0 items-center gap-3 rounded-xl px-3',
                isList ? 'w-full' : 'w-[264px] bg-[var(--neutral-0)] shadow-[0_0_0_1px_rgba(14,14,14,0.06)]'
              )}
            >
              <div className="h-11 w-11 shrink-0 rounded-full animate-shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-24 rounded-full animate-shimmer" />
                <div className="h-3 w-16 rounded-full animate-shimmer" />
              </div>
            </div>
          ))}
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

  /** One reason per person: mutual friends beat shared genres; friend-of-a-friend is the fallback. */
  const reasonFor = (s: FriendSuggestion): string => {
    if (s.mutual_friends_count > 0) {
      return `${s.mutual_friends_count} mutual friend${s.mutual_friends_count !== 1 ? 's' : ''}`;
    }
    const genres = s.shared_genres_count ?? 0;
    if (genres > 0) return `${genres} shared genre${genres !== 1 ? 's' : ''}`;
    return s.connection_depth === 2 ? 'Friend of a friend' : '';
  };

  const renderCards = (cards: React.ReactNode) =>
    isList ? (
      <div className="flex flex-col">{cards}</div>
    ) : (
      // Right-edge fade: a cut-off card reads as "more to swipe", not as a layout bug.
      <ScrollArea className="w-full [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]">
        <div className="flex w-max gap-2 px-4 pb-3">{cards}</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );

  return (
    <div className="flex w-full flex-col">
      <div className={cn('flex items-center justify-between pb-2', isList ? 'px-3' : 'px-4')}>
        <h2 className="text-[13px] font-semibold text-[var(--neutral-600)]">People you may know</h2>
        {onDismiss && (
          <button
            type="button"
            aria-label="Hide suggestions"
            onClick={onDismiss}
            className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-[var(--neutral-400)] transition-colors hover:text-[var(--neutral-600)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {renderCards(visibleSuggestions.map((suggestion) => {
            const isSent = sentUserIds.has(suggestion.user_id);
            const isRemoving = removingUserIds.has(suggestion.user_id);
            const reason = reasonFor(suggestion);

            return (
              <div
                key={suggestion.user_id}
                className={cn(
                  'flex h-16 shrink-0 cursor-pointer select-none items-center gap-2.5 rounded-xl pl-3 pr-1.5',
                  // In the side panel the panel is the surface, so rows carry no ring of their own.
                  isList
                    ? 'w-full'
                    : 'w-[264px] bg-[var(--neutral-0)] shadow-[0_0_0_1px_rgba(14,14,14,0.06),0_1px_2px_rgba(14,14,14,0.04)]',
                  'transition-[opacity,transform,background-color] duration-200 ease-out hover:bg-[var(--neutral-50)]',
                  isRemoving && 'pointer-events-none scale-95 opacity-0'
                )}
                onClick={() => onUserClick?.(suggestion.user_id)}
                role="link"
                aria-label={`Open ${suggestion.name}'s profile`}
              >
                {/* No verified badge: suggestion.verified is is_public_profile, so it marked nearly everyone. */}
                <Avatar className="h-11 w-11 shrink-0 overflow-hidden">
                  {suggestion.avatar_url ? (
                    <ProgressiveImage src={suggestion.avatar_url} alt="" className="h-11 w-11 rounded-full" />
                  ) : (
                    <AvatarFallback className="bg-synth-pink/10 text-sm text-synth-pink">
                      {getInitials(suggestion.name)}
                    </AvatarFallback>
                  )}
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-5 text-[var(--neutral-900)]">{suggestion.name}</p>
                  {reason && <p className="truncate text-xs leading-4 text-[var(--neutral-600)]">{reason}</p>}
                </div>

                {onAddFriend && (
                  <button
                    type="button"
                    aria-label={isSent ? `Request sent to ${suggestion.name}` : `Add ${suggestion.name}`}
                    disabled={isSent}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddFriend(suggestion.user_id);
                    }}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 active:scale-[0.96]',
                      isSent
                        ? 'bg-green-50 text-green-600'
                        : 'bg-[var(--brand-pink-050)] text-[var(--brand-pink-500)] hover:bg-[color-mix(in_srgb,var(--brand-pink-500)_14%,var(--neutral-0))]'
                    )}
                  >
                    {isSent ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Dismiss ${suggestion.name}`}
                  className="flex h-8 w-7 shrink-0 items-center justify-center text-[var(--neutral-400)] transition-colors hover:text-[var(--neutral-600)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismissSuggestion(suggestion.user_id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>
            );
          }))}
    </div>
  );
};
