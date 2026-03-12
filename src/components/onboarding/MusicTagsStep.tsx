import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Music, User as UserIcon, Loader2, LogIn } from 'lucide-react';
import { MUSIC_GENRES } from '@/data/musicGenres';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import { streamingSyncService } from '@/services/streamingSyncService';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';

interface MusicTagsStepProps {
  onNext?: (data: { genres: string[]; artists: string[] }) => void;
  onBack?: () => void;
  onSkip?: () => void;
  /** When true (default), show Back/Skip/Complete buttons. When false, step is a section only; parent owns submit. */
  showButtons?: boolean;
  /** Parent can receive current genres/artists for single-page submit. */
  onChange?: (data: { genres: string[]; artists: string[] }) => void;
  initialGenres?: string[];
  initialArtists?: string[];
}

export const MusicTagsStep = ({
  onNext,
  onBack,
  onSkip,
  showButtons = true,
  onChange,
  initialGenres,
  initialArtists,
}: MusicTagsStepProps) => {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [customGenre, setCustomGenre] = useState('');
  const [customArtist, setCustomArtist] = useState('');
  const [genreSearchOpen, setGenreSearchOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [artistSearchResults, setArtistSearchResults] = useState<any[]>([]);
  const [isSearchingArtists, setIsSearchingArtists] = useState(false);
  const [artistSearchOpen, setArtistSearchOpen] = useState(false);
  const artistSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [appleMusicSyncing, setAppleMusicSyncing] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const hasPrefilledGenresRef = useRef(false);
  const hasPrefilledArtistsRef = useRef(false);

  // Report state to parent for single-page onboarding
  useEffect(() => {
    onChange?.({ genres: selectedGenres, artists: selectedArtists });
  }, [selectedGenres, selectedArtists, onChange]);

  useEffect(() => {
    if (initialGenres === undefined || hasPrefilledGenresRef.current) return;
    setSelectedGenres(initialGenres);
    hasPrefilledGenresRef.current = true;
  }, [initialGenres]);

  useEffect(() => {
    if (initialArtists === undefined || hasPrefilledArtistsRef.current) return;
    setSelectedArtists(initialArtists);
    hasPrefilledArtistsRef.current = true;
  }, [initialArtists]);

  const toggleGenre = (genre: string) => {
    let added = false;
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) {
        setErrors((prevErrors) => ({ ...prevErrors, genres: '' }));
        return prev.filter((g) => g !== genre);
      }

      if (prev.length >= 7) {
        setErrors((prevErrors) => ({ ...prevErrors, genres: 'Maximum 7 genres allowed' }));
        return prev;
      }

      added = true;
      setErrors((prevErrors) => ({ ...prevErrors, genres: '' }));
      return [...prev, genre];
    });
    return added;
  };
 
  const handleAddGenre = (genre: string) => {
    const added = toggleGenre(genre);
    if (added) {
      setGenreSearchOpen(false);
    }
  };

  const handleAddCustomGenre = () => {
    const genre = customGenre.trim();
    if (!genre) return;

    const added = toggleGenre(genre);
    if (added) {
      setCustomGenre('');
    }
  };

  const handleRemoveGenre = (genre: string) => {
    toggleGenre(genre);
  };

  // Search artists using trigram search
  useEffect(() => {
    if (customArtist.trim().length < 2) {
      setArtistSearchResults([]);
      setArtistSearchOpen(false);
      return;
    }

    // Debounce search
    if (artistSearchTimeoutRef.current) {
      clearTimeout(artistSearchTimeoutRef.current);
    }

    artistSearchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingArtists(true);
      try {
        const results = await UnifiedArtistSearchService.searchArtistsTrigram(
          customArtist.trim(),
          5
        );
        setArtistSearchResults(results);
        setArtistSearchOpen(results.length > 0);
      } catch (error) {
        logger.error('Error searching artists:', error);
        setArtistSearchResults([]);
      } finally {
        setIsSearchingArtists(false);
      }
    }, 300);

    return () => {
      if (artistSearchTimeoutRef.current) {
        clearTimeout(artistSearchTimeoutRef.current);
      }
    };
  }, [customArtist]);

  const handleSelectArtist = (artist: { name: string; id: string }) => {
    if (selectedArtists.length >= 15) {
      setErrors({ ...errors, artists: 'Maximum 15 artists allowed' });
      return;
    }

    if (!selectedArtists.includes(artist.name)) {
      setSelectedArtists([...selectedArtists, artist.name]);
      setCustomArtist('');
      setArtistSearchResults([]);
      setArtistSearchOpen(false);
      setErrors({ ...errors, artists: '' });
    }
  };

  const handleAddArtist = () => {
    const artist = customArtist.trim();
    if (!artist) return;

    if (selectedArtists.length >= 15) {
      setErrors({ ...errors, artists: 'Maximum 15 artists allowed' });
      return;
    }

    if (!selectedArtists.includes(artist)) {
      setSelectedArtists([...selectedArtists, artist]);
      setCustomArtist('');
      setArtistSearchResults([]);
      setArtistSearchOpen(false);
      setErrors({ ...errors, artists: '' });
    }
  };

  const handleRemoveArtist = (artist: string) => {
    setSelectedArtists(selectedArtists.filter((a) => a !== artist));
    setErrors({ ...errors, artists: '' });
  };

  const handleConnectSpotify = async () => {
    try {
      setSpotifyConnecting(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('spotify_connect_source', 'onboarding');
      }
      await spotifyService.authenticate();
      // On success, authenticate redirects to Spotify's OAuth page
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      toast({
        title: 'Connection failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSpotifyConnecting(false);
    }
  };

  const handleConnectAppleMusic = async () => {
    let syncStarted = false;
    try {
      setAppleMusicSyncing(true);
      await appleMusicService.authenticate();
      streamingSyncService.startSync('apple-music');
      syncStarted = true;
      const success = await appleMusicService.syncProfileData();
      if (success) {
        streamingSyncService.completeSync();
        toast({
          title: 'Apple Music connected',
          description: 'Your music preferences have been synced.',
        });
      } else {
        streamingSyncService.errorSync('Sync failed');
        toast({
          title: 'Sync failed',
          description: 'Could not sync Apple Music data.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      if (syncStarted) {
        streamingSyncService.errorSync(message);
      }
      toast({
        title: 'Connection failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setAppleMusicSyncing(false);
    }
  };

  const handleSubmit = () => {
    if (!onNext) return;
    onNext({
      genres: selectedGenres,
      artists: selectedArtists,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-[24px] font-bold leading-[1.3]">Tell us about your music taste</h2>
        <p className="text-muted-foreground">
          This helps us recommend events and connect you with like-minded people
        </p>
      </div>

      {/* Genres Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            Favorite Genres (Optional)
          </Label>
          <span className="text-[16px] font-medium leading-[1.5] text-muted-foreground">
            {selectedGenres.length}/7
          </span>
        </div>

        {/* Genre Selection */}
        <div className="space-y-2">
          <Popover open={genreSearchOpen} onOpenChange={setGenreSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start bg-white">
                Select genres...
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 bg-white" align="start">
              <Command className="bg-white">
                <CommandInput placeholder="Search genres..." className="bg-white" />
                <CommandEmpty>No genre found.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto bg-white">
                  {MUSIC_GENRES.filter((g) => !selectedGenres.includes(g)).map((genre) => (
                    <CommandItem
                      key={genre}
                      onSelect={() => handleAddGenre(genre)}
                      className="hover:bg-gray-100"
                    >
                      {genre}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="grid grid-cols-2 gap-2">
            {MUSIC_GENRES.slice(0, 20).map((genre) => (
              <Button
                key={genre}
                type="button"
                size="sm"
                variant={selectedGenres.includes(genre) ? 'default' : 'outline'}
                onClick={() => toggleGenre(genre)}
                disabled={!selectedGenres.includes(genre) && selectedGenres.length >= 7}
                className="justify-start text-xs"
              >
                {genre}
              </Button>
            ))}
          </div>

          {/* Custom Genre Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Or type a custom genre..."
              value={customGenre}
              onChange={(e) => setCustomGenre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomGenre();
                }
              }}
              className="bg-white"
            />
            <Button type="button" onClick={handleAddCustomGenre} variant="secondary">
              Add
            </Button>
          </div>
        </div>

        {/* Selected Genres */}
        {selectedGenres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedGenres.map((genre, index) => (
              <div
                key={genre}
                className="inline-flex items-center gap-1.5"
                style={{
                  height: '25px',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  backgroundColor: 'var(--brand-pink-500)',
                  borderRadius: '999px',
                }}
              >
                <span className="button-text-meta" style={{ color: 'var(--neutral-50)' }}>{genre}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveGenre(genre)}
                  className="flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{
                    color: 'var(--neutral-50)',
                    width: '24px',
                    height: '24px',
                  }}
                >
                  <X style={{ width: '24px', height: '24px', color: 'var(--neutral-50)' }} />
                </button>
              </div>
            ))}
          </div>
        )}
        {selectedGenres.length > 0 && (
          <p className="text-[16px] font-medium leading-[1.5] text-muted-foreground">
            Your top 3 genres get higher weight in recommendations
          </p>
        )}

        {errors.genres && (
          <p className="text-[16px] font-medium leading-[1.5] text-destructive">{errors.genres}</p>
        )}
      </div>

      {/* Artists Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            Favorite Artists (Optional)
          </Label>
          <span className="text-[16px] font-medium leading-[1.5] text-muted-foreground">
            {selectedArtists.length}/15
          </span>
        </div>

        {/* Artist Input with Autocomplete */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Type an artist name..."
                value={customArtist}
                onChange={(e) => setCustomArtist(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (artistSearchResults.length > 0 && artistSearchOpen) {
                      handleSelectArtist(artistSearchResults[0]);
                    } else {
                      handleAddArtist();
                    }
                  }
                }}
                onFocus={() => {
                  if (artistSearchResults.length > 0 && customArtist.trim().length >= 2) {
                    setArtistSearchOpen(true);
                  }
                }}
                onBlur={() => {
                  // Delay closing to allow click on dropdown
                  setTimeout(() => setArtistSearchOpen(false), 200);
                }}
                className="bg-white"
              />
              {isSearchingArtists && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <Button type="button" onClick={handleAddArtist} variant="secondary">
              Add
            </Button>
          </div>

          {/* Artist Search Results Dropdown */}
          {artistSearchOpen && artistSearchResults.length > 0 && (
            <div 
              className="border rounded-md bg-white shadow-md max-h-48 overflow-auto z-10"
              onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking dropdown
            >
              {artistSearchResults.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => handleSelectArtist(artist)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
                >
                  <span className="flex-1">{artist.name}</span>
                  {artist.genres && artist.genres.length > 0 && (
                    <span className="text-[16px] font-medium leading-[1.5] text-muted-foreground">
                      {artist.genres[0]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Artists */}
        {selectedArtists.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedArtists.map((artist, index) => (
              <div
                key={artist}
                className="inline-flex items-center gap-1.5"
                style={{
                  height: '25px',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  backgroundColor: 'var(--brand-pink-500)',
                  borderRadius: '999px',
                }}
              >
                <span className="button-text-meta" style={{ color: 'var(--neutral-50)' }}>{artist}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveArtist(artist)}
                  className="flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{
                    color: 'var(--neutral-50)',
                    width: '24px',
                    height: '24px',
                  }}
                >
                  <X style={{ width: '24px', height: '24px', color: 'var(--neutral-50)' }} />
                </button>
              </div>
            ))}
          </div>
        )}
        {selectedArtists.length > 0 && (
          <p className="text-[16px] font-medium leading-[1.5] text-muted-foreground">
            Your top 3 artists get higher weight in recommendations
          </p>
        )}

        {errors.artists && (
          <p className="text-[16px] font-medium leading-[1.5] text-destructive">{errors.artists}</p>
        )}
      </div>

      {/* Optional: Connect your music */}
      <div className="space-y-3">
        <p className="text-[16px] font-medium leading-[1.5] text-muted-foreground">
          Connect your music (optional)
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-green-500 text-neutral-900 hover:bg-green-50 hover:text-neutral-900"
            onClick={handleConnectSpotify}
            disabled={spotifyConnecting}
          >
            {spotifyConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
                Connecting…
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-neutral-900" />
                Connect Spotify
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-red-500 text-neutral-900 hover:bg-red-50 hover:text-neutral-900"
            onClick={handleConnectAppleMusic}
            disabled={appleMusicSyncing}
          >
            {appleMusicSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
                Syncing…
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-neutral-900" />
                Connect Apple Music
              </>
            )}
          </Button>
        </div>
      </div>

      {showButtons && (
        <div className="flex gap-3 pt-4">
          {onBack != null && (
            <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
              Back
            </Button>
          )}
          {onSkip != null && (
            <Button type="button" variant="outline" onClick={onSkip} className="flex-1">
              Skip
            </Button>
          )}
          {onNext != null && (
            <Button onClick={handleSubmit} className="flex-1">
              Complete Setup
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

