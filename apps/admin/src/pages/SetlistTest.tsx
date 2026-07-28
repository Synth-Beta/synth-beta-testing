import React from 'react';
import { SetlistDisplay } from '@/components/SetlistDisplay';
import { useSetlist } from '@/hooks/useSetlist';

const SetlistTest: React.FC = () => {
  // Test with one of the enriched events we found
  const testEventId = 'test-event-id'; // Replace with actual event ID from database
  
  const { setlist, loading, error, hasSetlist } = useSetlist(testEventId);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Setlist Display Test</h1>
        <div className="text-center">Loading setlist data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Setlist Display Test</h1>
        <div className="text-center text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Setlist Display Test</h1>
      
      {hasSetlist && setlist ? (
        <SetlistDisplay setlist={setlist} className="mb-6" />
      ) : (
        <div className="text-center text-muted-foreground">
          <p>No setlist data available for this event.</p>
          <p className="text-sm mt-2">
            To test with real data, replace the testEventId with an actual event ID from your database.
          </p>
        </div>
      )}

      <div className="mt-8 p-4 bg-muted/30 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Test Instructions:</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Find an event ID from your database that has setlist data</li>
          <li>Replace the testEventId in this component</li>
          <li>The setlist will display with all songs, sets, and metadata</li>
          <li>Click the external link to view on setlist.fm</li>
        </ol>
      </div>
    </div>
  );
};

export default SetlistTest;
