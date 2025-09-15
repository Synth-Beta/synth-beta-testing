import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArtistSelectionService } from '@/services/artistSelectionService';
import { ArtistCard } from './ArtistCard';
import type { ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import type { ArtistSelectionResult } from '@/services/artistSelectionService';

export function ArtistSelectionTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ArtistSelectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testArtistSelection = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Create a mock artist search result
      const mockArtist: ArtistSearchResult = {
        id: 'test-artist-1',
        identifier: 'jambase:test-artist-1',
        name: 'Taylor Swift',
        image_url: null,
        genres: ['Pop', 'Country'],
        num_upcoming_events: 5,
        match_score: 95,
        band_or_musician: 'Musician',
        is_from_database: false
      };

      console.log('🧪 Testing artist selection with:', mockArtist.name);
      
      const selectionResult = await ArtistSelectionService.selectArtist(mockArtist);
      setResult(selectionResult);
      
      console.log('✅ Test successful:', selectionResult);
      
    } catch (err) {
      console.error('❌ Test failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setResult(null);
    setError(null);
  };

  if (result) {
    return (
      <div className="w-full max-w-4xl mx-auto p-6">
        <Button onClick={handleBack} className="mb-4">
          ← Back to Test
        </Button>
        <ArtistCard
          artist={result.artist}
          events={result.events}
          totalEvents={result.totalEvents}
          source={result.source}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Artist Selection Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This test will select "Taylor Swift" as an artist and fetch their events from the JamBase API.
          </p>
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <h3 className="font-semibold text-red-800">Test Failed</h3>
              <p className="text-red-600">{error}</p>
            </div>
          )}
          
          <Button 
            onClick={testArtistSelection}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Testing Artist Selection...' : 'Test Artist Selection'}
          </Button>
          
          <div className="text-sm text-muted-foreground">
            <p><strong>What this test does:</strong></p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Calls JamBase API to fetch events for Taylor Swift</li>
              <li>Populates the jambase_events table in Supabase</li>
              <li>Displays an artist card with the fetched events</li>
              <li>Shows upcoming and past events separately</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
