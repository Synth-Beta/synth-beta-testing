import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Search } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import { ArtistProfile } from './ArtistProfile';
import type { Artist } from '@/types/concertSearch';

interface SimpleArtistSearchProps {
  userId?: string;
}

export function SimpleArtistSearch({ userId }: SimpleArtistSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const performSearch = async () => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔍 Searching for: "${searchQuery}"`);
      const results = await UnifiedArtistSearchService.searchArtists(searchQuery, 10);
      console.log(`✅ Found ${results.length} results:`, results);
      
      setSearchResults(results);
    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
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

  const handleChooseArtist = (searchResult: ArtistSearchResult) => {
    const artist = convertToArtist(searchResult);
    setSelectedArtist(artist);
    setShowProfile(true);
    console.log('🎯 Artist chosen:', artist);
  };

  const handleBack = () => {
    setShowProfile(false);
    setSelectedArtist(null);
  };

  const handleInterestToggle = (eventId: string, interested: boolean) => {
    console.log(`User ${userId} ${interested ? 'interested in' : 'not interested in'} event ${eventId}`);
  };

  const handleReview = (eventId: string) => {
    console.log(`User ${userId} wants to review event ${eventId}`);
  };

  if (showProfile && selectedArtist) {
    return (
      <ArtistProfile
        artist={selectedArtist}
        onBack={handleBack}
        onInterestToggle={handleInterestToggle}
        onReview={handleReview}
        userId={userId}
      />
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">Simple Artist Search</h1>
        <p className="text-gray-600">Search for an artist and click "Choose" to view their profile</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search Artists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              type="text"
              placeholder="Search for artists like Taylor Swift, The Beatles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && performSearch()}
            />
            <Button onClick={performSearch} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>
          
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {searchResults.map((artist, index) => (
                <div
                  key={artist.id || index}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
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
                    </div>

                    <div className="flex-shrink-0">
                      <Button
                        onClick={() => handleChooseArtist(artist)}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        Choose Artist
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {searchQuery.length >= 2 && !isLoading && searchResults.length === 0 && !error && (
        <Card>
          <CardContent className="text-center py-8">
            <Music className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No artists found for "{searchQuery}"</p>
            <p className="text-sm text-gray-400">Try a different search term</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
