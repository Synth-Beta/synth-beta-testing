import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleButtonTest } from './SimpleButtonTest';
import { ChooseButtonTest } from './ChooseButtonTest';
import { DebugSearchResults } from './DebugSearchResults';
import { FixedSearchResults } from './FixedSearchResults';
import { Bug, Zap, Search, Wrench } from 'lucide-react';

interface ChooseButtonDebugPageProps {
  userId?: string;
}

export function ChooseButtonDebugPage({ userId = 'test-user-123' }: ChooseButtonDebugPageProps) {
  const [activeTab, setActiveTab] = useState('simple');

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Button Debug Page
          </h1>
          <p className="text-lg text-gray-600">
            Test different components to debug why the "Choose" button isn't working
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="simple" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Simple Test
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Search Test
            </TabsTrigger>
            <TabsTrigger value="debug" className="flex items-center gap-2">
              <Bug className="w-4 h-4" />
              Debug Search
            </TabsTrigger>
            <TabsTrigger value="fixed" className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Fixed Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="simple">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Simple Button Test
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Test if basic buttons work in your environment
                </p>
              </CardHeader>
              <CardContent>
                <SimpleButtonTest />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Search with Choose Buttons
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Test the search functionality with choose buttons
                </p>
              </CardHeader>
              <CardContent>
                <ChooseButtonTest />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debug">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="w-5 h-5" />
                  Debug Search Results
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Debug version with extensive logging and error handling
                </p>
              </CardHeader>
              <CardContent>
                <DebugSearchResults searchQuery="Goose" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fixed">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Fixed Search Results
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Fixed version without toast dependency, with better error handling
                </p>
              </CardHeader>
              <CardContent>
                <FixedSearchResults
                  searchQuery="Goose"
                  searchType="artists"
                  onBack={() => console.log('Back clicked')}
                  userId={userId}
                  onArtistSelect={(artist) => {
                    console.log('Artist selected:', artist);
                    alert(`You selected: ${artist.name}`);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Debugging Steps:</h3>
          <ol className="text-sm text-blue-800 space-y-1">
            <li>1. Start with <strong>Simple Test</strong> - verify basic buttons work</li>
            <li>2. Try <strong>Search Test</strong> - test search with choose buttons</li>
            <li>3. Use <strong>Debug Search</strong> - check console logs for errors</li>
            <li>4. Test <strong>Fixed Search</strong> - fixed version without toast</li>
            <li>5. Check browser console for any error messages</li>
            <li>6. Verify that clicks are being registered</li>
          </ol>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold text-yellow-900 mb-2">Common Issues:</h3>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• Toast hook not working - use Fixed Search instead</li>
            <li>• Event propagation issues - check console logs</li>
            <li>• CSS z-index problems - buttons might be behind other elements</li>
            <li>• JavaScript errors preventing click handlers from running</li>
            <li>• Missing dependencies or imports</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
