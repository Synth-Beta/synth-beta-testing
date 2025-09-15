import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Search, X } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import type { Artist } from '@/types/concertSearch';

export function ArtistSearchDebug() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);

  const performSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔍 Debug: Searching for: "${query}"`);
      const results = await UnifiedArtistSearchService.searchArtists(query, 10);
      console.log(`✅ Debug: Found ${results.length} results:`, results);
      
      setSearchResults(results);
    } catch (err) {
      console.error('❌ Debug: Search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    performSearch(searchQuery);
  };

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

  const handleArtistClick = (searchResult: ArtistSearchResult) => {
    const artist = convertToArtist(searchResult);
    setSelectedArtist(artist);
    console.log('🎯 Debug: Artist clicked:', artist);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Artist Search Debug</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search Artists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Search for artists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>
          
          {error && (
            <div className="mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Results ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {searchResults.map((artist, index) => (
                <div
                  key={artist.id || index}
                  className="p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {artist.image_url ? (
                        <img
                          src={artist.image_url}
                          alt={artist.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <Music className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{artist.name}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        {artist.band_or_musician && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {artist.band_or_musician}
                          </Badge>
                        )}
                        {artist.num_upcoming_events && artist.num_upcoming_events > 0 && (
                          <span>{artist.num_upcoming_events} events</span>
                        )}
                      </div>
                      {artist.genres && artist.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {artist.genres.slice(0, 3).map((genre, genreIndex) => (
                            <Badge key={genreIndex} variant="secondary" className="text-xs">
                              {genre}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        Match: {Math.round(artist.match_score)}% | 
                        Source: {artist.is_from_database ? 'Database' : 'JamBase'}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleArtistClick(artist)}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        Choose
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedArtist && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Artist</CardTitle>
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
                <p className="text-sm text-gray-600">{selectedArtist.description}</p>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                  <span>Source: {selectedArtist.source}</span>
                  <span>•</span>
                  <span>Popularity: {selectedArtist.popularity_score}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
