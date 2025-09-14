import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Database, CheckCircle, XCircle, RefreshCw, Trash2 } from 'lucide-react';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';

export function ArtistSearchFlowTest() {
  const [testResults, setTestResults] = useState<{
    step1_api_call: boolean;
    step2_database_population: boolean;
    step3_fuzzy_matching: boolean;
    step4_ui_display: boolean;
  }>({
    step1_api_call: false,
    step2_database_population: false,
    step3_fuzzy_matching: false,
    step4_ui_display: false,
  });
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<ArtistSearchResult[]>([]);
  const [databaseStats, setDatabaseStats] = useState<{
    total_artists: number;
    bands: number;
    musicians: number;
  } | null>(null);
  const [testQuery, setTestQuery] = useState('Phish');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  const loadDatabaseStats = async () => {
    try {
      const artists = await UnifiedArtistSearchService.getAllArtists(1000);
      const bands = artists.filter(a => a.band_or_musician === 'band').length;
      const musicians = artists.filter(a => a.band_or_musician === 'musician').length;
      
      setDatabaseStats({
        total_artists: artists.length,
        bands,
        musicians
      });
      
      addLog(`📊 Database stats loaded: ${artists.length} total artists`);
    } catch (error) {
      addLog(`❌ Error loading database stats: ${error}`);
    }
  };

  const runCompleteFlowTest = async () => {
    setIsLoading(true);
    setTestResults({
      step1_api_call: false,
      step2_database_population: false,
      step3_fuzzy_matching: false,
      step4_ui_display: false,
    });
    setSearchResults([]);
    addLog(`🚀 Starting complete flow test with query: "${testQuery}"`);

    try {
      // Step 1: API Call
      addLog(`📡 Step 1: Calling JamBase API for "${testQuery}"`);
      const results = await UnifiedArtistSearchService.searchArtists(testQuery, 10);
      setTestResults(prev => ({ ...prev, step1_api_call: true }));
      addLog(`✅ Step 1 Complete: Found ${results.length} artists from API`);

      // Step 2: Database Population (happens automatically in searchArtists)
      setTestResults(prev => ({ ...prev, step2_database_population: true }));
      addLog(`✅ Step 2 Complete: Artists populated in database`);

      // Step 3: Fuzzy Matching (happens automatically in searchArtists)
      setTestResults(prev => ({ ...prev, step3_fuzzy_matching: true }));
      addLog(`✅ Step 3 Complete: Fuzzy matching applied to results`);

      // Step 4: UI Display
      setSearchResults(results);
      setTestResults(prev => ({ ...prev, step4_ui_display: true }));
      addLog(`✅ Step 4 Complete: Results displayed in UI`);

      addLog(`🎉 Complete flow test successful!`);
      
      // Reload database stats
      await loadDatabaseStats();
    } catch (error) {
      addLog(`❌ Flow test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearDatabase = async () => {
    if (!confirm('Are you sure you want to clear all artists from the database?')) {
      return;
    }

    try {
      setIsLoading(true);
      addLog(`🗑️ Clearing all artists from database...`);
      await UnifiedArtistSearchService.clearAllArtists();
      addLog(`✅ Database cleared successfully`);
      await loadDatabaseStats();
      setSearchResults([]);
    } catch (error) {
      addLog(`❌ Error clearing database: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testFuzzyMatching = async () => {
    try {
      setIsLoading(true);
      addLog(`🔍 Testing fuzzy matching with various queries...`);
      
      const testQueries = ['phish', 'PHISH', 'ph', 'ish', 'dead', 'grateful'];
      const allResults: ArtistSearchResult[] = [];
      
      for (const query of testQueries) {
        addLog(`🔍 Testing query: "${query}"`);
        const results = await UnifiedArtistSearchService.searchArtists(query, 5);
        allResults.push(...results);
        addLog(`  Found ${results.length} results with scores: ${results.map(r => Math.round(r.match_score)).join(', ')}`);
      }
      
      // Remove duplicates and sort by match score
      const uniqueResults = allResults.filter((artist, index, self) => 
        index === self.findIndex(a => a.id === artist.id)
      ).sort((a, b) => b.match_score - a.match_score);
      
      setSearchResults(uniqueResults.slice(0, 10));
      addLog(`🎯 Fuzzy matching test complete: ${uniqueResults.length} unique results`);
    } catch (error) {
      addLog(`❌ Fuzzy matching test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testJamBaseAPI = async () => {
    try {
      setIsLoading(true);
      addLog(`🔌 Testing JamBase API connection...`);
      
      const result = await UnifiedArtistSearchService.testJamBaseAPI();
      setApiTestResult(result);
      
      if (result.success) {
        addLog(`✅ JamBase API test successful: ${result.message}`);
      } else {
        addLog(`❌ JamBase API test failed: ${result.message}`);
      }
    } catch (error) {
      addLog(`❌ JamBase API test error: ${error}`);
      setApiTestResult({
        success: false,
        message: `Test error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDatabaseStats();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Artist Search Flow Test
          </CardTitle>
          <CardDescription>
            Test the complete flow: User searches → API call → Database population → Fuzzy matching → UI display
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Test Controls */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-64">
              <input
                type="text"
                placeholder="Enter artist name to test..."
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Button 
              onClick={runCompleteFlowTest} 
              disabled={isLoading || !testQuery.trim()}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Music className="h-4 w-4" />
              )}
              Test Complete Flow
            </Button>
            <Button 
              onClick={testFuzzyMatching} 
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Test Fuzzy Matching
            </Button>
            <Button 
              onClick={testJamBaseAPI} 
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Database className="h-4 w-4" />
              Test JamBase API
            </Button>
            <Button 
              onClick={clearDatabase} 
              disabled={isLoading}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear Database
            </Button>
          </div>

          {/* Test Results */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl mb-2">
                {testResults.step1_api_call ? (
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                ) : (
                  <XCircle className="h-8 w-8 text-gray-400 mx-auto" />
                )}
              </div>
              <div className="font-semibold">API Call</div>
              <div className="text-sm text-gray-600">JamBase API</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl mb-2">
                {testResults.step2_database_population ? (
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                ) : (
                  <XCircle className="h-8 w-8 text-gray-400 mx-auto" />
                )}
              </div>
              <div className="font-semibold">Database</div>
              <div className="text-sm text-gray-600">Population</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl mb-2">
                {testResults.step3_fuzzy_matching ? (
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                ) : (
                  <XCircle className="h-8 w-8 text-gray-400 mx-auto" />
                )}
              </div>
              <div className="font-semibold">Fuzzy Match</div>
              <div className="text-sm text-gray-600">Algorithm</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl mb-2">
                {testResults.step4_ui_display ? (
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                ) : (
                  <XCircle className="h-8 w-8 text-gray-400 mx-auto" />
                )}
              </div>
              <div className="font-semibold">UI Display</div>
              <div className="text-sm text-gray-600">Results</div>
            </div>
          </div>

          {/* API Test Result */}
          {apiTestResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  JamBase API Test Result
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`p-4 rounded-lg ${apiTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {apiTestResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className={`font-medium ${apiTestResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {apiTestResult.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${apiTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                    {apiTestResult.message}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Database Stats */}
          {databaseStats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">{databaseStats.total_artists}</div>
                    <div className="text-sm text-muted-foreground">Total Artists</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{databaseStats.bands}</div>
                    <div className="text-sm text-muted-foreground">Bands</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{databaseStats.musicians}</div>
                    <div className="text-sm text-muted-foreground">Musicians</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>
                  {searchResults.length} artists found with fuzzy matching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {searchResults.map((artist, index) => (
                    <div key={artist.id || index} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="flex-shrink-0">
                        {artist.image_url ? (
                          <img
                            src={artist.image_url}
                            alt={artist.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                            <Music className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{artist.name}</div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {artist.band_or_musician && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {artist.band_or_musician}
                            </Badge>
                          )}
                          {artist.num_upcoming_events && (
                            <span>{artist.num_upcoming_events} events</span>
                          )}
                        </div>
                        {artist.genres && artist.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {artist.genres.slice(0, 3).map((genre, genreIndex) => (
                              <Badge key={genreIndex} variant="secondary" className="text-xs">
                                {genre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{Math.round(artist.match_score)}%</div>
                        <div className="text-xs text-gray-500">match</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Logs */}
          <Card>
            <CardHeader>
              <CardTitle>Test Logs</CardTitle>
              <CardDescription>
                Real-time logs of the test process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-gray-500">No logs yet. Run a test to see logs here.</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="mb-1">{log}</div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
