import React from 'react';
import { StructuredConcertSearch } from './StructuredConcertSearch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Music, Calendar, MapPin, Info } from 'lucide-react';
import type { Event } from '@/types/concertSearch';

interface SearchResult {
  events: Event[];
  totalFound: number;
  searchType: 'similar' | 'artist_recent_upcoming';
}

interface StructuredSearchDemoProps {
  userId: string;
}

export function StructuredSearchDemo({ userId }: StructuredSearchDemoProps) {
  const handleEventsFound = (result: SearchResult) => {
    console.log('Search completed:', result);
    
    // You can process the results here:
    // - Link events to user profile
    // - Show notifications
    // - Update UI state
    // - etc.
  };

  const formatEventDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Demo Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Structured Concert Search Demo
          </CardTitle>
          <CardDescription>
            This demo shows the new structured search functionality that leverages the API more accurately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Music className="h-4 w-4" />
                Artist Only Search
              </h4>
              <p className="text-sm text-gray-600 mb-2">
                When only an artist is provided, returns:
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 10 most recent concerts (past year)</li>
                <li>• 10 upcoming concerts</li>
                <li>• All events uploaded to Supabase</li>
              </ul>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Structured Search
              </h4>
              <p className="text-sm text-gray-600 mb-2">
                When venue and/or date are provided, returns:
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 20 most similar events</li>
                <li>• Better API accuracy</li>
                <li>• All events uploaded to Supabase</li>
              </ul>
            </div>
          </div>
          
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">How It Works</h4>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. User enters structured search parameters (Artist required, Venue & Date optional)</li>
                  <li>2. System checks Supabase for existing similar events</li>
                  <li>3. If needed, queries JamBase API with structured parameters</li>
                  <li>4. Returns up to 20 most similar events</li>
                  <li>5. All new events are automatically uploaded to Supabase</li>
                </ol>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Structured Search Component */}
      <StructuredConcertSearch onEventsFound={handleEventsFound} userId={userId} />
    </div>
  );
}
