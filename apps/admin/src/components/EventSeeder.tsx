import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MapPin, Calendar, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { seedDCEvents } from '@/scripts/seedDCEvents';

interface SeedingResult {
  fetched: number;
  saved: number;
  error?: string;
}

export function EventSeeder() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [result, setResult] = useState<SeedingResult | null>(null);
  const [progress, setProgress] = useState(0);

  const handleSeedEvents = async () => {
    setIsSeeding(true);
    setResult(null);
    setProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 1000);

      const seedingResult = await seedDCEvents();
      
      clearInterval(progressInterval);
      setProgress(100);
      
      setResult(seedingResult);
    } catch (error) {
      setResult({
        fetched: 0,
        saved: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          DC Events Seeder
        </CardTitle>
        <CardDescription>
          Populate the database with 100 upcoming events in Washington, DC from JamBase
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Calendar className="h-8 w-8 text-blue-600" />
          <div>
            <h3 className="font-medium text-blue-900">Washington, DC Events</h3>
            <p className="text-sm text-blue-700">
              Fetches upcoming concerts, shows, and events in the DC area
            </p>
          </div>
        </div>

        {isSeeding && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Fetching events from JamBase and saving to database...</span>
            </div>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-gray-500">
              This may take a minute as we fetch events and save them to the database
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.error ? (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-900">Seeding Failed</h4>
                  <p className="text-sm text-red-700 mt-1">{result.error}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-900">Seeding Complete!</h4>
                  <div className="flex gap-4 mt-2">
                    <Badge variant="outline" className="bg-white">
                      📡 {result.fetched} Fetched
                    </Badge>
                    <Badge variant="outline" className="bg-white">
                      💾 {result.saved} Saved
                    </Badge>
                  </div>
                  <p className="text-sm text-green-700 mt-2">
                    Events are now available in the Events tab and search functionality
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            onClick={handleSeedEvents} 
            disabled={isSeeding}
            className="flex-1"
          >
            {isSeeding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Seeding Events...
              </>
            ) : (
              <>
                <MapPin className="mr-2 h-4 w-4" />
                Seed 100 DC Events
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>• This is a one-time operation to populate the database</p>
          <p>• Events will be fetched from JamBase API for Washington, DC area</p>
          <p>• Duplicate events will be automatically skipped</p>
          <p>• The process may take 1-2 minutes to complete</p>
        </div>
      </CardContent>
    </Card>
  );
}
