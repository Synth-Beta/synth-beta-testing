import React, { useState, useEffect, useRef } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, X, Star } from 'lucide-react';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import type { Artist, ArtistSearchResult } from '@/types/concertSearch';
import { cn } from '@/lib/utils';
import { trackInteraction } from '@/services/interactionTrackingService';

interface ArtistSearchBoxProps {
  onArtistSelect: (artist: Artist) => void;
  placeholder?: string;
  className?: string;
  hideClearButton?: boolean;
  onSearchStateChange?: (isSearching: boolean) => void;
}

export function ArtistSearchBox({ 
  onArtistSelect, 
  placeholder = "Search for an artist...",
  className,
  hideClearButton = false,
  onSearchStateChange
}: ArtistSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setIsOpen(false);
      onSearchStateChange?.(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await performSearch(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !searchResults) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < searchResults.artists.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < searchResults.artists.length) {
            handleArtistSelect(searchResults.artists[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const performSearch = async (searchQuery: string) => {
    try {
      setIsLoading(true);
      const results = await UnifiedArtistSearchService.searchArtists(searchQuery, 10);
      
      // Transform UnifiedArtistSearchService results to match expected format
      // Ensure id is the UUID from artists table (not jambase_artist_id text)
      const transformedResults = {
        artists: results.map(result => ({
          id: result.id, // This should be the UUID from artists table
          jambase_artist_id: result.identifier?.replace('jambase:', '') || result.id,
          name: result.name,
          description: `${result.num_upcoming_events || 0} upcoming events`,
          genres: result.genres || [],
          image_url: result.image_url,
          popularity_score: result.num_upcoming_events || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: result.is_from_database ? 'database' as const : 'jambase' as const
        })),
        totalFound: results.length,
        query: searchQuery
      };
      
      setSearchResults(transformedResults);
      setIsOpen(true);
      setSelectedIndex(-1);
      onSearchStateChange?.(true);
    } catch (error) {
      console.error('Artist search error:', error);
      setSearchResults({
        artists: [],
        totalFound: 0,
        query: searchQuery
      });
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArtistSelect = (artist: Artist) => {
    try { trackInteraction.click('artist', (artist as any).id || (artist as any).jambase_artist_id || artist.name, { source: 'artist_search_box', name: (artist as any).name }); } catch {}
    onArtistSelect(artist);
    setQuery(artist.name);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSearchStateChange?.(false);
    // Blur the search input
    const input = document.getElementById('artist-search-input') as HTMLInputElement;
    input?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleInputFocus = () => {
    if (searchResults && searchResults.artists.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing to allow for click events
    setTimeout(() => {
      setIsOpen(false);
      setSelectedIndex(-1);
      onSearchStateChange?.(false);
    }, 150);
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults(null);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSearchStateChange?.(false);
    // Focus the search input after clearing
    const input = document.getElementById('artist-search-input') as HTMLInputElement;
    input?.focus();
  };

  const formatGenres = (genres: string[] = []) => {
    return genres.slice(0, 3).join(', ');
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <SearchBar
          id="artist-search-input"
          name="artistSearch"
          placeholder={placeholder}
          value={query}
          onChange={(value) => setQuery(value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          widthVariant="full"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
          {query && !isLoading && !hideClearButton && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {isOpen && searchResults && (
        <div className="absolute top-full left-0 right-0 z-[9999] mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          {searchResults.artists.length > 0 ? (
            <div 
              ref={listRef} 
              className="max-h-[min(500px,calc(100vh-300px))] overflow-y-auto overscroll-contain synth-scrollbar"
              style={{
                scrollBehavior: 'smooth',
              }}
            >
              {searchResults.artists.map((artist, index) => (
                <div
                  key={artist.id}
                  className={cn(
                    "relative px-4 py-3 cursor-pointer transition-all duration-150",
                    "flex items-center gap-3",
                    "hover:bg-gray-50",
                    selectedIndex === index && "bg-blue-50"
                  )}
                  onClick={() => handleArtistSelect(artist)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {/* Blue accent bar for selected item */}
                  {selectedIndex === index && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r" />
                  )}
                  
                  {/* Artist Image */}
                  <div className="flex-shrink-0">
                    {artist.image_url ? (
                      <img
                        src={artist.image_url}
                        alt={artist.name}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center ring-2 ring-gray-100">
                        <Music className="w-6 h-6 text-pink-500" />
                      </div>
                    )}
                  </div>
                  
                  {/* Artist Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                      {artist.name}
                    </h3>
                    {artist.genres && artist.genres.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {formatGenres(artist.genres)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              
              {searchResults.totalFound > searchResults.artists.length && (
                <div className="sticky bottom-0 px-4 py-2 text-xs text-gray-500 text-center bg-gray-50 border-t border-gray-200">
                  Showing {searchResults.artists.length} of {searchResults.totalFound} artists
                </div>
              )}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <Music className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No artists found</h3>
              <p className="text-sm text-gray-600">Try a different search term</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
