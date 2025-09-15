import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Music, Calendar } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';

interface DebugSearchResultsProps {
  searchQuery: string;
}

export function DebugSearchResults({ searchQuery }: DebugSearchResultsProps) {
  const [searchResults, setSearchResults] = useState<ArtistSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [clickedArtists, setClickedArtists] = useState<string[]>([]);

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsLoading(true);
    try {
      console.log(`🔍 Debug: Searching for: "${query}"`);
      const results = await UnifiedArtistSearchService.searchArtists(query, 10);
      console.log(`✅ Debug: Found ${results.length} results:`, results);
      setSearchResults(results);
    } catch (error) {
      console.error('❌ Debug: Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChooseClick = (artist: ArtistSearchResult, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('🎯 Debug: Choose button clicked!');
    console.log('🎯 Debug: Artist:', artist);
    console.log('🎯 Debug: Event:', event);
    
    setClickedArtists(prev => [...prev, artist.name]);
    
    // Show multiple types of feedback
    alert(`You chose: ${artist.name}`);
    
    // Also log to console
    console.log(`✅ Debug: Successfully chose ${artist.name}`);
  };

  const handleCardClick = (artist: ArtistSearchResult) => {
    console.log('🎯 Debug: Card clicked for:', artist.name);
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="text-lg">Searching...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Debug: Found {searchResults.length} artists for "{searchQuery}"
      </div>
      
      {searchResults.map((artist, index) => (
        <Card 
          key={artist.id || index} 
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => handleCardClick(artist)}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                      <Music className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {artist.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    {artist.band_or_musician && (
                      <Badge variant="outline" className="capitalize">
                        {artist.band_or_musician}
                      </Badge>
                    )}
                    {artist.num_upcoming_events && artist.num_upcoming_events > 0 && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{artist.num_upcoming_events} upcoming events</span>
                      </div>
                    )}
                  </div>
                  {artist.genres && artist.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {artist.genres.map((genre, genreIndex) => (
                        <Badge key={genreIndex} variant="secondary" className="text-xs">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Choose Button with explicit debugging */}
              <div className="flex-shrink-0">
                <Button
                  onClick={(e) => handleChooseClick(artist, e)}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  style={{ 
                    minWidth: '120px',
                    zIndex: 10,
                    position: 'relative'
                  }}
                >
                  Choose Artist
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {clickedArtists.length > 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-800">Clicked Artists ({clickedArtists.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {clickedArtists.map((name, index) => (
                <div key={index} className="text-green-700">
                  {index + 1}. {name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          No artists found for "{searchQuery}"
        </div>
      )}
    </div>
  );
}
