import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Users, Calendar, Search, X } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import type { Artist } from '@/types/concertSearch';

interface ArtistSearchProps {
  onArtistSelect?: (artist: Artist) => void;
  placeholder?: string;
  showResults?: boolean;
  maxResults?: number;
}

export function ArtistSearch({ 
  onArtistSelect, 
  placeholder = "Search for artists...",
  showResults = true,
  maxResults = 10
}: ArtistSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Convert ArtistSearchResult to Artist
  const convertToArtist = (searchResult: ArtistSearchResult): Artist => {
    return {
      id: searchResult.id,
      jambase_artist_id: searchResult.identifier,
      name: searchResult.name,
      description: `Artist found with ${searchResult.num_upcoming_events || 0} upcoming events`,
      genres: searchResult.genres || [],
      image_url: searchResult.image_url,
      popularity_score: searchResult.num_upcoming_events || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: searchResult.is_from_database ? 'database' : 'jambase'
    };
  };

  // Debounced search function
  const performSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔍 Searching for: "${query}"`);
      const results = await UnifiedArtistSearchService.searchArtists(query, maxResults);
      console.log(`✅ Found ${results.length} results`);
      
      setSearchResults(results);
      setShowSuggestions(true);
    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      setSearchResults([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300); // 300ms debounce
  };

  // Handle artist selection
  const handleArtistSelect = (searchResult: ArtistSearchResult) => {
    const artist = convertToArtist(searchResult);
    setSelectedArtist(artist);
    setSearchQuery(artist.name);
    setShowSuggestions(false);
    
    if (onArtistSelect) {
      onArtistSelect(artist);
    }
    
    console.log('🎯 Selected artist:', artist);
  };

  // Handle clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSuggestions(false);
    setSelectedArtist(null);
    setError(null);
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
          <Search className="h-4 w-4" />
        </div>
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => {
            if (searchResults.length > 0) {
              setShowSuggestions(true);
            }
          }}
          className="pl-10 pr-10"
        />
        {isLoading && (
          <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {searchQuery && !isLoading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-2 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {/* Search Suggestions */}
      {showSuggestions && searchResults.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto"
        >
          {searchResults.map((artist, index) => (
            <div
              key={artist.id || index}
              className="w-full px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                {/* Artist Image */}
                <div className="flex-shrink-0">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center ${artist.image_url ? 'hidden' : ''}`}>
                    <Music className="h-6 w-6 text-gray-400" />
                  </div>
                </div>
                
                {/* Artist Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{artist.name}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    {artist.band_or_musician && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {artist.band_or_musician}
                      </Badge>
                    )}
                    {artist.num_upcoming_events && artist.num_upcoming_events > 0 && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{artist.num_upcoming_events} events</span>
                      </div>
                    )}
                  </div>
                  {artist.genres && artist.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {artist.genres.slice(0, 2).map((genre, genreIndex) => (
                        <Badge key={genreIndex} variant="secondary" className="text-xs">
                          {genre}
                        </Badge>
                      ))}
                      {artist.genres.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{artist.genres.length - 2} more
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Match: {Math.round(artist.match_score)}%
                  </div>
                </div>

                {/* Choose Button */}
                <div className="flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArtistSelect(artist);
                    }}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    Choose
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Artist Display */}
      {selectedArtist && showResults && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Selected Artist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {selectedArtist.image_url ? (
                <img
                  src={selectedArtist.image_url}
                  alt={selectedArtist.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                  <Music className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{selectedArtist.name}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  {selectedArtist.band_or_musician && (
                    <Badge variant="outline" className="capitalize">
                      {selectedArtist.band_or_musician}
                    </Badge>
                  )}
                  {selectedArtist.num_upcoming_events && selectedArtist.num_upcoming_events > 0 && (
                    <span>• {selectedArtist.num_upcoming_events} upcoming events</span>
                  )}
                </div>
                {selectedArtist.genres && selectedArtist.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedArtist.genres.map((genre, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {searchQuery.length >= 2 && !isLoading && searchResults.length === 0 && !error && showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-gray-500">
          <Music className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No artists found for "{searchQuery}"</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      )}
    </div>
  );
}
