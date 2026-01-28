import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Music, User as UserIcon, Loader2 } from 'lucide-react';
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

interface MusicTagsStepProps {
  onNext: (data: { genres: string[]; artists: string[] }) => void;
  onBack: () => void;
  onSkip: () => void;
}

export const MusicTagsStep = ({ onNext, onBack, onSkip }: MusicTagsStepProps) => {
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

  const handleAddGenre = (genre: string) => {
    if (selectedGenres.length >= 7) {
      setErrors({ ...errors, genres: 'Maximum 7 genres allowed' });
      return;
    }
    if (!selectedGenres.includes(genre)) {
      setSelectedGenres([...selectedGenres, genre]);
      setErrors({ ...errors, genres: '' });
    }
    setGenreSearchOpen(false);
  };

  const handleAddCustomGenre = () => {
    const genre = customGenre.trim();
    if (!genre) return;

    if (selectedGenres.length >= 7) {
      setErrors({ ...errors, genres: 'Maximum 7 genres allowed' });
      return;
    }

    if (!selectedGenres.includes(genre)) {
      setSelectedGenres([...selectedGenres, genre]);
      setCustomGenre('');
      setErrors({ ...errors, genres: '' });
    }
  };

  const handleRemoveGenre = (genre: string) => {
    setSelectedGenres(selectedGenres.filter((g) => g !== genre));
    setErrors({ ...errors, genres: '' });
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
        console.error('Error searching artists:', error);
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

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    if (selectedGenres.length < 3) {
      newErrors.genres = 'Please select at least 3 genres';
    }

    if (selectedArtists.length < 3) {
      newErrors.artists = 'Please add at least 3 artists';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onNext({
      genres: selectedGenres,
      artists: selectedArtists,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Tell us about your music taste</h2>
        <p className="text-muted-foreground">
          This helps us recommend events and connect you with like-minded people
        </p>
      </div>

      {/* Genres Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            Favorite Genres
            <span className="text-destructive">*</span>
          </Label>
          <span className="text-xs text-muted-foreground">
            {selectedGenres.length}/7 (min 3)
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
          <p className="text-xs text-muted-foreground">
            Your top 3 genres get higher weight in recommendations
          </p>
        )}

        {errors.genres && (
          <p className="text-sm text-destructive">{errors.genres}</p>
        )}
      </div>

      {/* Artists Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            Favorite Artists
            <span className="text-destructive">*</span>
          </Label>
          <span className="text-xs text-muted-foreground">
            {selectedArtists.length}/15 (min 3)
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
                    <span className="text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
            Your top 3 artists get higher weight in recommendations
          </p>
        )}

        {errors.artists && (
          <p className="text-sm text-destructive">{errors.artists}</p>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
        <p className="text-blue-700 dark:text-blue-300">
          💡 <strong>Tip:</strong> You can also connect your Spotify account later to
          automatically sync your music preferences!
        </p>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="button" variant="outline" onClick={onSkip} className="flex-1">
          Skip
        </Button>
        <Button onClick={handleSubmit} className="flex-1">
          Complete Setup
        </Button>
      </div>
    </div>
  );
};

