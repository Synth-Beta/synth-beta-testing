import React, { useState } from 'react';

// Define proper types
interface ConcertEvent {
  id: string;
  artist: string;
  venue: string;
  date: string;
  // Add other properties as needed
}

interface SearchParams {
  artist: string;
  venue: string;
  date: string;
}

interface ConcertApiService {
  searchEvent: (params: SearchParams, userId: string) => Promise<{ event: ConcertEvent }>;
}

interface Props {
  userId: string;
  onBack: () => void;
  onSelectEvent: (event: ConcertEvent) => void;
  apiService?: ConcertApiService; // Optional prop for dependency injection
}

const ConcertFeed: React.FC<Props> = ({ 
  userId, 
  onBack, 
  onSelectEvent, 
  apiService 
}) => {
  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateSearchParams = (): boolean => {
    return !!(artist.trim() || venue.trim() || date.trim());
  };

  const getApiService = (): ConcertApiService => {
    if (apiService) {
      return apiService;
    }
    
    const globalService = (window as any).concertApiService;
    if (!globalService || typeof globalService.searchEvent !== 'function') {
      throw new Error('Concert API service is not available.');
    }
    
    return globalService;
  };

  const handleSearch = async () => {
    if (!validateSearchParams()) {
      setError('Please enter at least one search criteria (artist, venue, or date).');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const params: SearchParams = { artist, venue, date };
      const concertApiService = getApiService();
      const result = await concertApiService.searchEvent(params, userId);
      
      if (result?.event) {
        onSelectEvent(result.event);
      } else {
        setError('No event found matching your search criteria.');
      }
    } catch (err: any) {
      console.error('Concert search error:', err);
      setError(err?.message || 'An error occurred while searching for events.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSearch();
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Search Concerts</h2>
      
      <div className="flex flex-col gap-3 mb-4">
        <input
          type="text"
          placeholder="Artist name"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          onKeyPress={handleKeyPress}
          className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        
        <input
          type="text"
          placeholder="Venue name"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          onKeyPress={handleKeyPress}
          className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyPress={handleKeyPress}
          className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSearch}
          disabled={loading || !validateSearchParams()}
          className={`flex-1 p-3 rounded-md font-medium transition-colors ${
            loading || !validateSearchParams()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {loading ? 'Searching...' : 'Search Events'}
        </button>
        
        <button
          onClick={onBack}
          disabled={loading}
          className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium transition-colors disabled:opacity-50"
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default ConcertFeed;