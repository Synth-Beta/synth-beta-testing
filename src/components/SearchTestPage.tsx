import React from 'react';
import { ArtistSearchFlowTest } from './ArtistSearchFlowTest';
import { ArtistSearch } from './ArtistSearch';
import { UnifiedEventSearch } from './UnifiedEventSearch';

export function SearchTestPage() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Search Infrastructure Test</h1>
          <p className="text-gray-600">Test the new artist search flow and components</p>
        </div>

        {/* Artist Search Flow Test */}
        <ArtistSearchFlowTest />

        {/* Individual Component Tests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Artist Search Component */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Artist Search Component</h2>
            <ArtistSearch
              onArtistSelect={(artist) => console.log('Selected artist:', artist)}
              placeholder="Test artist search..."
              maxResults={5}
            />
          </div>

          {/* Unified Event Search Component */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Unified Event Search</h2>
            <UnifiedEventSearch
              userId="test-user-id"
              onEventFound={(artist, venue, date) => console.log('Event found:', { artist: artist.name, venue, date })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
