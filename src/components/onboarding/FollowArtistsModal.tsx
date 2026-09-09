import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArtistFollowService } from '@/services/artistFollowService';
import { OnboardingService } from '@/services/onboardingService';

interface FollowArtistsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  artists: FollowArtistOption[];
  /**
   * `bypassArtistMinimum` is true only when the artist list itself failed to load, so the
   * caller can tell "met the requirement" apart from "we could not offer anything to pick".
   */
  onDone: (bypassArtistMinimum?: boolean) => Promise<void> | void;
}

export interface FollowArtistOption {
  name: string;
  id?: string;
  image_url?: string;
}

export const FollowArtistsModal = ({
  open,
  onOpenChange,
  userId,
  artists,
  onDone,
}: FollowArtistsModalProps) => {
  const MIN_FOLLOWS = OnboardingService.MIN_ARTIST_FOLLOWS;

  const [visibleArtists, setVisibleArtists] = useState<FollowArtistOption[]>(artists);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [followedCount, setFollowedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  const getArtistKey = (artist: FollowArtistOption) => {
    if (artist.id) {
      return artist.id;
    }
    return artist.name.trim().toLowerCase();
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        // Seed from what is already on record so progress carries across platforms:
        // someone who followed two artists on mobile only needs one more here.
        const [existing, suggested] = await Promise.all([
          OnboardingService.countArtistFollows(userId).catch(() => 0),
          OnboardingService.getSuggestedArtists(),
        ]);
        if (cancelled) return;

        setFollowedCount(existing);

        // Artists resolved from what they typed come first, then suggestions fill the rest
        // so there is always enough on screen to reach the minimum.
        const merged: FollowArtistOption[] = [...artists];
        const seen = new Set(merged.map(getArtistKey));
        for (const artist of suggested) {
          if (seen.has(artist.id)) continue;
          seen.add(artist.id);
          merged.push({ id: artist.id, name: artist.name, image_url: artist.image_url ?? undefined });
        }
        setVisibleArtists(merged);
        setLoadFailed(false);
      } catch (error) {
        if (cancelled) return;
        console.warn('FollowArtistsModal: could not load suggested artists:', error);
        setVisibleArtists(artists);
        // Same rule as the mobile artist step: a minimum may never become a wall when the
        // app itself cannot offer anything to pick from.
        setLoadFailed(artists.length === 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId, artists]);

  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 2) return;
    try {
      const results = await OnboardingService.searchArtists(value.trim());
      setVisibleArtists(
        results.map((artist) => ({
          id: artist.id,
          name: artist.name,
          image_url: artist.image_url ?? undefined,
        }))
      );
      if (results.length > 0) setLoadFailed(false);
    } catch (error) {
      console.warn('FollowArtistsModal: artist search failed:', error);
    }
  };

  const remainingFollows = Math.max(0, MIN_FOLLOWS - followedCount);
  const canFinish = remainingFollows === 0 || loadFailed;

  const handleFollowArtist = async (artist: FollowArtistOption) => {
    const key = getArtistKey(artist);
    if (pendingKeys.has(key)) {
      return;
    }

    setPendingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      if (artist.id) {
        await ArtistFollowService.setArtistFollow(userId, artist.id, true);
      } else {
        await ArtistFollowService.setArtistFollowByName(userId, artist.name, undefined, true);
      }

      setVisibleArtists((prev) => prev.filter((item) => getArtistKey(item) !== key));
      setFollowedCount((prev) => prev + 1);
    } catch (error) {
      console.warn(`FollowArtistsModal: could not follow artist "${artist.name}":`, error);
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const renderInitials = (name: string) => {
    const letters = name
      .split(' ')
      .map((segment) => segment.trim().charAt(0))
      .filter(Boolean)
      .join('');

    if (letters) {
      return letters.toUpperCase().slice(0, 2);
    }

    return name.slice(0, 2).toUpperCase();
  };

  const closeOffset = 'var(--spacing-screen-margin-x, 20px)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <div className="relative flex h-full flex-col overflow-hidden">
          <div style={{ paddingTop: closeOffset, paddingLeft: closeOffset, paddingRight: closeOffset }}>
            <div className="flex w-full items-center justify-end" style={{ height: '44px' }}>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 var(--neutral-900) shadow-sm"
                style={{
                  width: '44px',
                  height: '44px',
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <DialogTitle className="mt-3 text-center text-lg font-semibold">
              Follow your Favorite Artists
            </DialogTitle>
          </div>

          <DialogBody className="flex flex-1 flex-col gap-4 px-6 pb-6 pt-2">
            <p className="text-center text-sm text-muted-foreground">
              {loadFailed
                ? "We couldn't load artists right now — you can continue and follow artists later."
                : `Follow at least ${MIN_FOLLOWS} — this powers your personalized feed (${followedCount}/${MIN_FOLLOWS})`}
            </p>

            {!loadFailed && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => void handleSearch(event.target.value)}
                  placeholder="Search artists..."
                  className="pl-9"
                  aria-label="Search artists"
                />
              </div>
            )}

            <ScrollArea className="w-full">
              <div className="flex justify-center space-x-4 pb-4 pt-1">
                {visibleArtists.map((artist) => {
                  const key = getArtistKey(artist);
                  const isPending = pendingKeys.has(key);

                  return (
                    <div
                      key={key}
                      className="flex flex-col items-center min-w-[120px] max-w-[120px] rounded-lg"
                    >
                      <div className="relative mb-2 mt-1">
                        <Avatar className="h-16 w-16 ring-2 ring-synth-pink/20 transition-all">
                          <AvatarImage src={artist.image_url || undefined} alt={artist.name} />
                          <AvatarFallback className="bg-synth-pink/10 text-synth-pink">
                            {renderInitials(artist.name)}
                          </AvatarFallback>
                        </Avatar>
                      </div>

                      <p className="text-sm font-medium text-center text-synth-black truncate w-full mb-2">
                        {artist.name}
                      </p>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs w-full"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleFollowArtist(artist);
                        }}
                        disabled={isPending}
                      >
                        Add
                      </Button>
                    </div>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </DialogBody>

          <DialogFooter className="items-center justify-center sm:justify-center">
            <Button
              onClick={() => {
                void onDone(loadFailed && remainingFollows > 0);
              }}
              disabled={!canFinish}
              className="w-full max-w-xs"
              type="button"
            >
              {canFinish ? 'Done' : `Follow ${remainingFollows} more`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
