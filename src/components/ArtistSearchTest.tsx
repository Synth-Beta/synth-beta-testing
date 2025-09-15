import React from 'react';
import { ArtistSearchWithProfile } from './ArtistSearchWithProfile';

interface ArtistSearchTestProps {
  userId?: string;
}

export function ArtistSearchTest({ userId = 'test-user-123' }: ArtistSearchTestProps) {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Artist Search & Profile Test
          </h1>
          <p className="text-lg text-gray-600">
            Search for an artist and click on them to view their profile with events
          </p>
        </div>
        
        <ArtistSearchWithProfile userId={userId} />
      </div>
    </div>
  );
}
