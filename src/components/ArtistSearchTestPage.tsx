import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArtistSearch } from './ArtistSearch';
import { ArtistSearchWithProfile } from './ArtistSearchWithProfile';
import { ArtistSearchDebug } from './ArtistSearchDebug';
import { SimpleArtistSearch } from './SimpleArtistSearch';
import { Music, Search, Bug, Zap } from 'lucide-react';

interface ArtistSearchTestPageProps {
  userId?: string;
}

export function ArtistSearchTestPage({ userId = 'test-user-123' }: ArtistSearchTestPageProps) {
  const [activeTab, setActiveTab] = useState('simple');

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Artist Search Test Page
          </h1>
          <p className="text-lg text-gray-600">
            Test different artist search implementations to find the one that works best
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="simple" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Simple Search
            </TabsTrigger>
            <TabsTrigger value="integrated" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Integrated Search
            </TabsTrigger>
            <TabsTrigger value="debug" className="flex items-center gap-2">
              <Bug className="w-4 h-4" />
              Debug Search
            </TabsTrigger>
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              Basic Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="simple">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Simple Artist Search
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Clean, simple search with obvious "Choose Artist" buttons
                </p>
              </CardHeader>
              <CardContent>
                <SimpleArtistSearch userId={userId} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrated">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Integrated Search with Profile
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Complete integration that automatically opens artist profile
                </p>
              </CardHeader>
              <CardContent>
                <ArtistSearchWithProfile userId={userId} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debug">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="w-5 h-5" />
                  Debug Search
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Debug version with detailed logging and error information
                </p>
              </CardHeader>
              <CardContent>
                <ArtistSearchDebug />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="w-5 h-5" />
                  Basic Search Component
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Original search component with "Choose" buttons in dropdown
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <ArtistSearch
                    onArtistSelect={(artist) => {
                      console.log('Artist selected:', artist);
                      alert(`Selected: ${artist.name}`);
                    }}
                    placeholder="Search for artists..."
                    showResults={true}
                    maxResults={10}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Testing Instructions:</h3>
          <ol className="text-sm text-blue-800 space-y-1">
            <li>1. Try the <strong>Simple Search</strong> first - it has the most obvious "Choose Artist" buttons</li>
            <li>2. If that works, try the <strong>Integrated Search</strong> - it automatically opens the artist profile</li>
            <li>3. Use <strong>Debug Search</strong> if you need to see what's happening behind the scenes</li>
            <li>4. The <strong>Basic Search</strong> shows the original dropdown with "Choose" buttons</li>
          </ol>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold text-yellow-900 mb-2">Troubleshooting:</h3>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• Check the browser console for any error messages</li>
            <li>• Make sure you're searching for real artist names (e.g., "Taylor Swift", "The Beatles")</li>
            <li>• Try different search terms if one doesn't work</li>
            <li>• Look for the "Choose" or "Choose Artist" buttons - they should be clearly visible</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
