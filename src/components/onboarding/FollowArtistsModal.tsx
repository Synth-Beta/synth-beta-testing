import { useEffect, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { pickPreselected } from '@synth/shared';

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
  // Select, then save on Done (same model as the iOS artist step). The old follow-on-tap
  // model could not show pre-selected artists without silently following them.
  const [selected, setSelected] = useState<Map<string, FollowArtistOption>>(new Map());
  // Pre-select once: on a reopen (finish failed, retry) the RPC returns 3 new picks, which
  // would be followed without the user ever choosing them.
  const preselectedOnce = useRef(false);
  const [saving, setSaving] = useState(false);
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
          OnboardingService.getOnboardingSuggestions(),
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
        // Start with 3 checked (server picks, else the first 3) so Done works immediately.
        const preIds = new Set(
          pickPreselected(
            suggested.map((a) => ({ id: a.id, preselected: (a as { preselected?: boolean }).preselected }))
          )
        );
        if (!preselectedOnce.current) {
          preselectedOnce.current = true;
          setSelected((prev) =>
            prev.size > 0 ? prev : new Map(merged.filter((a) => a.id && preIds.has(a.id)).map((a) => [getArtistKey(a), a]))
          );
        }
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

  const remainingFollows = Math.max(0, MIN_FOLLOWS - followedCount - selected.size);
  const canFinish = remainingFollows === 0 || loadFailed;

  const toggleArtist = (artist: FollowArtistOption) => {
    const key = getArtistKey(artist);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, artist);
      return next;
    });
  };

  /**
   * Save the selection, then finish. Done, the X and dismissing the dialog all come here
   * so a selection is never lost. If every follow fails, the user still gets through
   * (bypass): a save error must never be the reason someone is stuck in onboarding.
   */
  const commit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const picks = [...selected.values()];
      const results = await Promise.allSettled(
        picks.map((artist) =>
          artist.id
            ? ArtistFollowService.setArtistFollow(userId, artist.id, true)
            : ArtistFollowService.setArtistFollowByName(userId, artist.name, undefined, true)
        )
      );
      const saved = results.filter((r) => r.status === 'fulfilled').length;
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn(`FollowArtistsModal: could not follow "${picks[i].name}":`, r.reason);
      });
      const allSavesFailed = picks.length > 0 && saved === 0;
      setFollowedCount((prev) => prev + saved);
      setSelected(new Map());
      // saved > 0: trust our own successful save over the server recount, so a lagging
      // count can't turn Done into a silent no-op.
      await onDone((loadFailed && followedCount + saved < MIN_FOLLOWS) || allSavesFailed || saved > 0);
    } finally {
      setSaving(false);
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
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : void commit())}>
      <DialogContent hideCloseButton>
        <div className="relative flex h-full flex-col overflow-hidden">
          <div style={{ paddingTop: closeOffset, paddingLeft: closeOffset, paddingRight: closeOffset }}>
            <div className="flex w-full items-center justify-end" style={{ height: '44px' }}>
              <button
                type="button"
                aria-label="Close"
                onClick={() => void commit()}
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
                : `We picked a few to start. Tap to change — 3 or more makes your feed much better (${followedCount + selected.size} selected)`}
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
                  const isSelected = selected.has(key);

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
                        variant={isSelected ? 'default' : 'outline'}
                        className="h-7 text-xs w-full"
                        aria-pressed={isSelected}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleArtist(artist);
                        }}
                        disabled={saving}
                      >
                        {isSelected ? (
                          <>
                            <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                            Added
                          </>
                        ) : (
                          'Add'
                        )}
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
              onClick={() => void commit()}
              disabled={!canFinish || saving}
              className="w-full max-w-xs"
              type="button"
            >
              {saving ? 'Saving…' : canFinish ? 'Done' : `Pick ${remainingFollows} more`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
