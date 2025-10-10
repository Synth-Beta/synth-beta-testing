import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import { ArtistSelectionService, ArtistSelectionResult } from '@/services/artistSelectionService';
import { ArtistCard } from './ArtistCard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SearchResultsPage } from './SearchResultsPage';
import { SynthSLogo } from '@/components/SynthSLogo';
import { trackInteraction } from '@/services/interactionTrackingService';
import { 
  Music, 
  Search, 
  Users, 
  UserPlus,
  Loader2,
  X,
  Calendar
} from 'lucide-react';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';

interface UnifiedSearchProps {
  userId: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  snapchat_handle: string | null;
  username?: string;
  email?: string;
}

export function UnifiedSearch({ userId }: UnifiedSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    artists: ArtistSearchResult[];
    users: UserProfile[];
  }>({ artists: [], users: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'search' | 'artists' | 'people' | 'artist-card'>('search');
  const [selectedArtist, setSelectedArtist] = useState<ArtistSelectionResult | null>(null);
  const [isSelectingArtist, setIsSelectingArtist] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const { toast } = useToast();
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function - always calls API for fresh results
  const performSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults({ artists: [], users: [] });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔍 Searching for: "${query}" - calling API for fresh results`);
      
      // Track search execution
      trackInteraction.search(query, 'search', 'unified_search', {
        queryLength: query.length,
        searchType: 'unified'
      });
      
      // Search both artists and users in parallel - always call API
      const [artistResults, userResults] = await Promise.all([
        searchArtists(query, 20),
        searchUsers(query, 20)
      ]);
      
      console.log(`✅ Found ${artistResults.length} artists and ${userResults.length} users`);
      console.log('Artists:', artistResults.map(a => a.name));
      console.log('Users:', userResults.map(u => u.name));
      
      const results = {
        artists: artistResults,
        users: userResults
      };
      
      setSearchResults(results);

      // Track search results
      trackInteraction.click('search', 'unified_search', {
        query,
        artistCount: artistResults.length,
        userCount: userResults.length,
        totalResults: artistResults.length + userResults.length
      });
      
    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      setSearchResults({ artists: [], users: [] });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Track search typing
    trackInteraction.search(value, 'search', 'unified_search', {
      queryLength: value.length,
      isTyping: true
    });

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search (reduced to 300ms for faster response)
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };


  const searchArtists = async (query: string, limit: number = 5): Promise<ArtistSearchResult[]> => {
    try {
      console.log(`🎵 Searching artists for: "${query}"`);
      
      // Always call API first for fresh results
      console.log(`📡 Calling API for fresh results...`);
      const results = await UnifiedArtistSearchService.searchArtists(query, limit);
      console.log(`✅ Found ${results.length} artists from API`);
      
      return results;
    } catch (error) {
      console.error('❌ API search failed, trying database fallback:', error);
      
      // Fallback to database if API fails
      try {
        const dbResults = await searchArtistsFromDatabase(query, limit);
        if (dbResults.length > 0) {
          console.log(`✅ Found ${dbResults.length} artists from database fallback`);
          return dbResults;
        }
      } catch (dbError) {
        console.error('❌ Database fallback also failed:', dbError);
      }
      
      return [];
    }
  };

  // Database-first artist search
  const searchArtistsFromDatabase = async (query: string, limit: number): Promise<ArtistSearchResult[]> => {
    try {
      const { data, error } = await supabase
        .from('jambase_events')
        .select('artist_name, artist_id, genres')
        .ilike('artist_name', `%${query}%`)
        .limit(limit);

      if (error) throw error;

      // Convert to search results format
      const uniqueArtists = new Map();
      data?.forEach(event => {
        if (event.artist_name && !uniqueArtists.has(event.artist_name.toLowerCase())) {
          uniqueArtists.set(event.artist_name.toLowerCase(), {
            id: event.artist_id || `db-${event.artist_name.toLowerCase().replace(/\s+/g, '-')}`,
            name: event.artist_name,
            identifier: event.artist_id || '',
            image_url: null,
            genres: event.genres || [],
            band_or_musician: 'band' as const,
            num_upcoming_events: 0,
            match_score: calculateMatchScore(query, event.artist_name),
            is_from_database: true,
          });
        }
      });

      return Array.from(uniqueArtists.values());
    } catch (error) {
      console.error('Database search error:', error);
      return [];
    }
  };

  // Simple match score calculation
  const calculateMatchScore = (query: string, name: string): number => {
    const queryLower = query.toLowerCase();
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes(queryLower)) {
      return 1.0;
    }
    
    // Simple fuzzy matching
    const queryWords = queryLower.split(' ');
    const nameWords = nameLower.split(' ');
    let matches = 0;
    
    queryWords.forEach(qWord => {
      nameWords.forEach(nWord => {
        if (nWord.includes(qWord) || qWord.includes(nWord)) {
          matches++;
        }
      });
    });
    
    return matches / queryWords.length;
  };

  const searchUsers = async (query: string, limit: number = 5): Promise<UserProfile[]> => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', `%${query}%`)
        .neq('user_id', userId) // Exclude current user
        .limit(limit);

      if (error) {
        console.error('Error searching users:', error);
        return [];
      }

      return (profiles || []) as unknown as UserProfile[];
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults({ artists: [], users: [] });
    setError(null);
    setCurrentView('search');

    // Track search clear
    trackInteraction.click('search', 'unified_search', {
      action: 'clear'
    });
  };

  const handleViewAllArtists = () => {
    setCurrentView('artists');

    // Track view all artists
    trackInteraction.click('search', 'view_all_artists', {
      resultCount: searchResults.artists.length
    });
  };

  const handleViewAllPeople = () => {
    setCurrentView('people');

    // Track view all people
    trackInteraction.click('search', 'view_all_people', {
      resultCount: searchResults.users.length
    });
  };

  const handleBackToSearch = () => {
    setCurrentView('search');
    setSelectedArtist(null);
    setShowAllEvents(false);

    // Track back to search
    trackInteraction.navigate('artists', 'search');
  };

  const handleArtistSelect = async (artist: ArtistSearchResult) => {
    try {
      setIsSelectingArtist(true);
      console.log('🎯 Selecting artist:', artist.name);
      
      // Track artist selection
      trackInteraction.search(artist.name, 'artist', artist.id, {
        rank: searchResults.artists.findIndex(a => a.id === artist.id) + 1,
        searchType: 'artist',
        hasImage: !!artist.image_url,
        genres: artist.genres,
        upcomingEvents: artist.num_upcoming_events
      });
      
      // Call the artist selection service
      const result = await ArtistSelectionService.selectArtist(artist);
      
      // Store the selection (optional)
      await ArtistSelectionService.storeArtistSelection(userId, result.artist);
      
      // Set the selected artist and show the card
      setSelectedArtist(result);
      setCurrentView('artist-card');
      
      toast({
        title: "Artist Selected! 🎵",
        description: `Found ${result.totalEvents} events for ${artist.name}`,
      });
      
    } catch (error) {
      console.error('❌ Error selecting artist:', error);
      toast({
        title: "Error",
        description: `Failed to load events for ${artist.name}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsSelectingArtist(false);
    }
  };

  const sendFriendRequest = async (targetUserId: string) => {
    try {
      console.log('Sending friend request to:', targetUserId);
      
      // Track friend request
      trackInteraction.like('user', targetUserId, true, {
        action: 'friend_request_send',
        source: 'search'
      });
      
      // Call the database function to create friend request
      const { data, error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: targetUserId
      });

      if (error) {
        console.error('Error creating friend request:', error);
        throw error;
      }

      // Remove the user from search results to show the request was sent
      setSearchResults(prev => ({
        ...prev,
        users: prev.users.filter(user => user.user_id !== targetUserId)
      }));

      toast({
        title: "Friend Request Sent! 🎉",
        description: "Your friend request has been sent and they'll be notified.",
      });
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Render full results page if viewing all results
  if (currentView === 'artists' || currentView === 'people') {
    return (
      <SearchResultsPage
        searchQuery={searchQuery}
        searchType={currentView}
        onBack={handleBackToSearch}
        userId={userId}
        onArtistSelect={handleArtistSelect}
      />
    );
  }

  // Render artist card if an artist is selected
  if (currentView === 'artist-card' && selectedArtist) {
    return (
      <ArtistCard
        artist={selectedArtist.artist}
        events={selectedArtist.events}
        totalEvents={selectedArtist.totalEvents}
        source={selectedArtist.source}
        userId={userId}
        onBack={handleBackToSearch}
        showAllEvents={showAllEvents}
        onViewAllEvents={() => {
          setShowAllEvents(!showAllEvents);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Unified Search */}
      <Card className="synth-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SynthSLogo size="sm" />
            <Search className="h-5 w-5" />
            Search
          </CardTitle>
          <CardDescription className="synth-text">
            Search for artists and people in one place
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search Input */}
          <div className="relative mb-6">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
              <Search className="h-4 w-4" />
            </div>
            <Input
              id="unified-search-input"
              name="unifiedSearch"
              type="text"
              placeholder="Search for artists or people..."
              value={searchQuery}
              onChange={handleInputChange}
              className="pl-10 pr-10"
            />
            {isLoading && (
              <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {searchQuery && !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <div className="space-y-6">
              {/* Artists Results */}
              {searchResults.artists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Music className="h-5 w-5" />
                      Artists ({searchResults.artists.length} results)
                    </h3>
                    {searchResults.artists.length > 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleViewAllArtists}
                        className="text-sm"
                      >
                        View All
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {searchResults.artists.slice(0, 3).map((artist, index) => (
                      <div key={artist.id || index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          {/* Artist Image */}
                          <div className="flex-shrink-0">
                            {artist.image_url ? (
                              <img
                                src={artist.image_url}
                                alt={artist.name}
                                className="w-12 h-12 rounded-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center ${artist.image_url ? 'hidden' : ''}`}>
                              <Music className="h-6 w-6 text-gray-400" />
                            </div>
                          </div>
                          
                          {/* Artist Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{artist.name}</div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                              {artist.band_or_musician && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {artist.band_or_musician}
                                </Badge>
                              )}
                              {artist.num_upcoming_events && artist.num_upcoming_events > 0 && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{artist.num_upcoming_events} events</span>
                                </div>
                              )}
                            </div>
                            {artist.genres && artist.genres.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {artist.genres.slice(0, 2).map((genre, genreIndex) => (
                                  <Badge key={genreIndex} variant="secondary" className="text-xs">
                                    {genre}
                                  </Badge>
                                ))}
                                {artist.genres.length > 2 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{artist.genres.length - 2} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Follow & Choose Buttons */}
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <ArtistFollowButton
                            artistName={artist.name}
                            jambaseArtistId={artist.identifier}
                            userId={userId}
                            variant="outline"
                            size="sm"
                            showFollowerCount={false}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleArtistSelect(artist)}
                            disabled={isSelectingArtist}
                            className="bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                          >
                            {isSelectingArtist ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              'Choose'
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* People Results */}
              {searchResults.users.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      People ({searchResults.users.length} results)
                    </h3>
                    {searchResults.users.length > 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleViewAllPeople}
                        className="text-sm"
                      >
                        View All
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {searchResults.users.slice(0, 3).map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback>
                              {user.name ? user.name.split(' ').map(n => n[0]).join('') : 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-gray-900">{user.name || 'Unknown User'}</h3>
                            {user.bio && (
                              <p className="text-sm text-gray-600 line-clamp-1">{user.bio}</p>
                            )}
                            {user.instagram_handle && (
                              <p className="text-xs text-gray-500">@{user.instagram_handle}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sendFriendRequest(user.user_id)}
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          <UserPlus className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {!isLoading && searchResults.artists.length === 0 && searchResults.users.length === 0 && (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">No Results Found</h3>
                  <p className="text-sm text-gray-600">Try searching with different terms</p>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {searchQuery.length < 2 && (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Search for Artists and People</h3>
              <p className="text-sm text-gray-600">Enter a name to find artists or other music lovers</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}