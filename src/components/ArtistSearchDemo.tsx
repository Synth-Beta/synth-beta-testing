import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Users, Calendar } from 'lucide-react';
import { JamBaseArtistSearchService } from '@/services/jambaseArtistSearchService';

export function ArtistSearchDemo() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = await JamBaseArtistSearchService.searchAndPopulateArtists(query, 10);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    handleSearch(value);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Artist Search Demo
          </CardTitle>
          <CardDescription>
            Search for artists using JamBase API. Results are automatically saved to the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Input
                placeholder="Search for artists (e.g., 'Phish', 'Dead & Company', 'Tame Impala')..."
                value={searchQuery}
                onChange={handleInputChange}
                className="pr-10"
              />
              {isLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">
                  Found {searchResults.length} artist{searchResults.length !== 1 ? 's' : ''}
                </h3>
                <div className="grid gap-3">
                  {searchResults.map((artist, index) => (
                    <Card key={artist.id || index} className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Artist Image */}
                        <div className="flex-shrink-0">
                          {artist.image_url ? (
                            <img
                              src={artist.image_url}
                              alt={artist.name}
                              className="w-16 h-16 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center ${artist.image_url ? 'hidden' : ''}`}>
                            <Music className="h-8 w-8 text-gray-400" />
                          </div>
                        </div>

                        {/* Artist Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-lg font-semibold text-gray-900 truncate">
                            {artist.name}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            {artist.band_or_musician && (
                              <Badge variant="outline" className="capitalize">
                                {artist.band_or_musician}
                              </Badge>
                            )}
                            {artist.num_upcoming_events && artist.num_upcoming_events > 0 && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{artist.num_upcoming_events} upcoming events</span>
                              </div>
                            )}
                          </div>
                          {artist.genres && artist.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {artist.genres.slice(0, 3).map((genre: string, genreIndex: number) => (
                                <Badge key={genreIndex} variant="secondary" className="text-xs">
                                  {genre}
                                </Badge>
                              ))}
                              {artist.genres.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{artist.genres.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}
                          {artist.match_score && (
                            <div className="text-xs text-gray-500 mt-1">
                              Match score: {Math.round(artist.match_score)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* No Results */}
            {searchQuery.length >= 2 && !isLoading && searchResults.length === 0 && !error && (
              <div className="text-center py-8 text-gray-500">
                <Music className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No artists found for "{searchQuery}"</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            )}

            {/* Instructions */}
            {searchQuery.length < 2 && (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Start typing to search for artists</p>
                <p className="text-sm">Results will be automatically saved to the database</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
