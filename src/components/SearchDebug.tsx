import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hybridSearchService } from '@/services/hybridSearchService';
import { SampleDataService } from '@/services/sampleDataService';
import { supabase } from '@/integrations/supabase/client';

export function SearchDebug() {
  const [eventCount, setEventCount] = useState<number>(0);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEventCount = async () => {
    try {
      const count = await SampleDataService.getEventCount();
      setEventCount(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get event count');
    }
  };

  const addSampleData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await SampleDataService.addSampleEvents();
      await checkEventCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sample data');
    } finally {
      setIsLoading(false);
    }
  };

  const clearData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await SampleDataService.clearAllEvents();
      await checkEventCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear data');
    } finally {
      setIsLoading(false);
    }
  };

  const testSearch = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await hybridSearchService.searchEvents('Taylor Swift');
      setSearchResults(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const testSupabaseConnection = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('jambase_events')
        .select('*')
        .limit(5);
      
      if (error) throw error;
      console.log('Supabase connection test:', data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Supabase connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Search Debug Panel</CardTitle>
          <CardDescription>
            Debug tools for testing the search functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={checkEventCount} variant="outline">
              Check Event Count
            </Button>
            <Button onClick={addSampleData} disabled={isLoading}>
              Add Sample Data
            </Button>
            <Button onClick={clearData} disabled={isLoading} variant="destructive">
              Clear All Data
            </Button>
            <Button onClick={testSupabaseConnection} disabled={isLoading} variant="outline">
              Test Supabase
            </Button>
            <Button onClick={testSearch} disabled={isLoading} variant="outline">
              Test Search
            </Button>
          </div>

          <div className="text-sm">
            <p><strong>Event Count:</strong> {eventCount}</p>
            {error && (
              <p className="text-red-600"><strong>Error:</strong> {error}</p>
            )}
          </div>

          {searchResults.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Search Results:</h3>
              <div className="space-y-2">
                {searchResults.map((result, index) => (
                  <div key={index} className="p-2 border rounded text-sm">
                    <p><strong>Title:</strong> {result.title}</p>
                    <p><strong>Source:</strong> {result.source}</p>
                    <p><strong>Confidence:</strong> {Math.round(result.confidence * 100)}%</p>
                    <p><strong>Existing:</strong> {result.isExisting ? 'Yes' : 'No'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
