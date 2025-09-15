import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Music, Calendar } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';

export function ChooseButtonTest() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [clickedArtist, setClickedArtist] = useState<ArtistSearchResult | null>(null);

  const performSearch = async () => {
    if (searchQuery.length < 2) return;

    setIsLoading(true);
    try {
      console.log(`🔍 Testing search for: "${searchQuery}"`);
      const results = await UnifiedArtistSearchService.searchArtists(searchQuery, 5);
      console.log(`✅ Found ${results.length} results:`, results);
      setSearchResults(results);
    } catch (error) {
      console.error('❌ Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChooseClick = (artist: ArtistSearchResult) => {
    console.log('🎯 Choose button clicked for:', artist);
    setClickedArtist(artist);
    alert(`You chose: ${artist.name}`);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Choose Button Test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Search for artists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && performSearch()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <Button onClick={performSearch} disabled={isLoading}>
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Search Results ({searchResults.length})</h3>
              {searchResults.map((artist, index) => (
                <div key={artist.id || index} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                        <Music className="h-6 w-6 text-gray-400" />
                      </div>
                      <div>
                        <div className="font-medium">{artist.name}</div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {artist.band_or_musician && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {artist.band_or_musician}
                            </Badge>
                          )}
                          {artist.num_upcoming_events && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{artist.num_upcoming_events} events</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => handleChooseClick(artist)}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      Choose
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {clickedArtist && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <h4 className="font-semibold text-green-800">Last Clicked Artist:</h4>
              <p className="text-green-700">{clickedArtist.name}</p>
              <p className="text-sm text-green-600">ID: {clickedArtist.id}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
