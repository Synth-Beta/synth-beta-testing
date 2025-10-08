import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, Music, X, Star, PlusCircle } from 'lucide-react';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import type { Artist, ArtistSearchResult } from '@/types/concertSearch';
import { cn } from '@/lib/utils';
import { trackInteraction } from '@/services/interactionTrackingService';
import { ManualArtistForm } from '@/components/search/ManualArtistForm';

interface ArtistSearchBoxProps {
  onArtistSelect: (artist: Artist) => void;
  placeholder?: string;
  className?: string;
}

export function ArtistSearchBox({ 
  onArtistSelect, 
  placeholder = "Search for an artist...",
  className 
}: ArtistSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showManualForm, setShowManualForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setIsOpen(false);
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
          } else if (query.trim()) {
            // If no item is selected but there's text, try manual selection
            handleManualSelect();
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
      const transformedResults = {
        artists: results.map(result => ({
          id: result.id,
          jambase_artist_id: result.identifier,
          name: result.name,
          description: `${result.num_upcoming_events || 0} upcoming events`,
          genres: result.genres || [],
          image_url: result.image_url,
          popularity_score: result.num_upcoming_events || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: result.is_from_database ? 'database' : 'jambase'
        })),
        totalFound: results.length,
        query: searchQuery
      };
      
      setSearchResults(transformedResults);
      setIsOpen(true);
      setSelectedIndex(-1);
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
    inputRef.current?.blur();
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
    }, 150);
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults(null);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const formatGenres = (genres: string[] = []) => {
    return genres.slice(0, 3).join(', ');
  };

  const handleManualArtistCreated = (artist: Artist) => {
    onArtistSelect(artist);
    setQuery(artist.name);
    setIsOpen(false);
  };

  return (
    <>
      <ManualArtistForm
        open={showManualForm}
        onClose={() => setShowManualForm(false)}
        onArtistCreated={handleManualArtistCreated}
        initialQuery={query}
      />
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          id="artist-search-input"
          name="artistSearch"
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className="pl-10 pr-20"
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
          {query && !isLoading && (
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
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto shadow-lg border">
          <CardContent className="p-0">
            {searchResults.artists.length > 0 ? (
              <div ref={listRef} className="py-2">
                {searchResults.artists.map((artist, index) => (
                  <div
                    key={artist.id}
                    className={cn(
                      "px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors",
                      "flex items-start gap-3",
                      selectedIndex === index && "bg-blue-50 border-l-4 border-blue-500"
                    )}
                    onClick={() => handleArtistSelect(artist)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {artist.image_url ? (
                        <img
                          src={artist.image_url}
                          alt={artist.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <Music className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 truncate text-base">
                            {artist.name}
                          </h3>
                          {artist.popularity_score && artist.popularity_score > 0 && (
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-yellow-400 fill-current" />
                              <span className="text-xs text-gray-500">
                                {artist.popularity_score}
                              </span>
                            </div>
                          )}
                          {(artist as any).source && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                (artist as any).source === 'database' 
                                  ? 'text-green-600 border-green-300' 
                                  : 'text-blue-600 border-blue-300'
                              }`}
                            >
                              {(artist as any).source === 'database' ? 'Database' : 'JamBase'}
                            </Badge>
                          )}
                        </div>
                      
                      {artist.description && (
                        <p className="text-sm text-gray-500 line-clamp-1 mb-2">
                          {artist.description}
                        </p>
                      )}
                      
                      {artist.genres && artist.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {artist.genres.slice(0, 3).map((genre, genreIndex) => (
                            <Badge
                              key={genreIndex}
                              variant="secondary"
                              className="text-xs px-2 py-0.5"
                            >
                              {genre}
                            </Badge>
                          ))}
                          {artist.genres.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{artist.genres.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {searchResults.totalFound > searchResults.artists.length && (
                  <div className="px-4 py-2 text-xs text-gray-500 text-center border-t">
                    Showing {searchResults.artists.length} of {searchResults.totalFound} artists
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                <Music className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>No artists found for "{query}"</p>
                <p className="text-sm text-gray-400 mb-3">Try a different search term</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    setShowManualForm(true);
                  }}
                  className="gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add "{query}" Manually
                </Button>
              </div>
            )}
            {searchResults.artists.length > 0 && (
              <div className="border-t px-4 py-3 bg-gray-50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    setShowManualForm(true);
                  }}
                  className="w-full gap-2 text-blue-600 hover:text-blue-700"
                >
                  <PlusCircle className="w-4 h-4" />
                  Can't find "{query}"? Add manually
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
