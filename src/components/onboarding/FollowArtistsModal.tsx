import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

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
import { ArtistFollowService } from '@/services/artistFollowService';

interface FollowArtistsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  artists: FollowArtistOption[];
  onDone: () => Promise<void> | void;
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
  const [visibleArtists, setVisibleArtists] = useState<FollowArtistOption[]>(artists);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setVisibleArtists(artists);
  }, [artists]);

  const getArtistKey = (artist: FollowArtistOption) => {
    if (artist.id) {
      return artist.id;
    }
    return artist.name.trim().toLowerCase();
  };

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
                className="flex items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-900 shadow-sm"
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
                void onDone();
              }}
              className="w-full max-w-xs"
              type="button"
            >
              Done
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
