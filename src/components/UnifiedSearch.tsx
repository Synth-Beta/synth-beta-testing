import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnifiedEventSearch } from './UnifiedEventSearch';
import { ArtistSearch } from './ArtistSearch';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Music, 
  Calendar, 
  MapPin, 
  Search, 
  Users, 
  UserPlus,
  Loader2,
  Database,
  ExternalLink
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState('artists');
  const [selectedArtist, setSelectedArtist] = useState<ArtistSearchResult | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserProfile[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [databaseStats, setDatabaseStats] = useState<{
    total_artists: number;
    bands: number;
    musicians: number;
  } | null>(null);
  const { toast } = useToast();

  // Load database stats on component mount
  useEffect(() => {
    loadDatabaseStats();
  }, []);

  // Handle user search
  useEffect(() => {
    if (activeTab === 'profiles') {
      searchUsers(userSearchQuery);
    }
  }, [userSearchQuery, activeTab]);

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
    } catch (error) {
      console.error('Error loading database stats:', error);
    }
  };

  const handleArtistSelect = (artist: ArtistSearchResult) => {
    setSelectedArtist(artist);
    console.log('🎯 Selected artist:', artist);
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setUserSearchResults([]);
      return;
    }

    try {
      setUserSearchLoading(true);
      
      // Search for users by name
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', `%${query}%`)
        .neq('user_id', userId) // Exclude current user
        .limit(20);

      if (error) {
        console.error('Error searching users:', error);
        toast({
          title: "Search Error",
          description: "Failed to search users. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setUserSearchResults((profiles || []) as unknown as UserProfile[]);
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: "Search Error",
        description: "Failed to search users. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUserSearchLoading(false);
    }
  };

  const handleUserSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setUserSearchQuery(query);
  };

  const sendFriendRequest = async (targetUserId: string) => {
    try {
      // TODO: Implement friend request functionality
      console.log('Sending friend request to:', targetUserId);
      toast({
        title: "Friend Request Sent",
        description: "Friend request sent successfully!",
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: "Failed to send friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEventFound = (artist: ArtistSearchResult, venue: string, date: string) => {
    console.log('🎵 Event found:', { artist: artist.name, venue, date });
    toast({
      title: "Event Created!",
      description: `Found event for ${artist.name} at ${venue} on ${date}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Database Stats */}
      {databaseStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Artist Database
            </CardTitle>
            <CardDescription>
              Artists automatically populated from JamBase API
            </CardDescription>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="artists" className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            Artists
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            People
          </TabsTrigger>
        </TabsList>

        <TabsContent value="artists" className="mt-6 space-y-6">
          {/* Artist Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Artists
              </CardTitle>
              <CardDescription>
                Search for artists using JamBase API. Results are automatically saved to our database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ArtistSearch
                onArtistSelect={handleArtistSelect}
                placeholder="Search for artists (e.g., 'Phish', 'Dead & Company')..."
                maxResults={15}
              />
            </CardContent>
          </Card>

          {/* Selected Artist Details */}
          {selectedArtist && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  Selected Artist
                </CardTitle>
                <CardDescription>
                  Artist details from our database
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  {selectedArtist.image_url ? (
                    <img
                      src={selectedArtist.image_url}
                      alt={selectedArtist.name}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                      <Music className="h-10 w-10 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{selectedArtist.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      {selectedArtist.band_or_musician && (
                        <Badge variant="outline" className="capitalize">
                          {selectedArtist.band_or_musician}
                        </Badge>
                      )}
                      {selectedArtist.num_upcoming_events && selectedArtist.num_upcoming_events > 0 && (
                        <span>• {selectedArtist.num_upcoming_events} upcoming events</span>
                      )}
                    </div>
                    {selectedArtist.genres && selectedArtist.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedArtist.genres.map((genre, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      Match Score: {Math.round(selectedArtist.match_score)}% • 
                      Source: {selectedArtist.is_from_database ? 'Database' : 'JamBase API'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-6 space-y-6">
          {/* Event Search */}
          <UnifiedEventSearch
            userId={userId}
            onEventFound={handleEventFound}
          />
        </TabsContent>

        <TabsContent value="profiles" className="mt-6 space-y-6">
          {/* Profile Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Find People
              </CardTitle>
              <CardDescription>
                Search for other users to connect with
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={userSearchQuery}
                  onChange={handleUserSearch}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* User Search Results */}
              {userSearchLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
                  <p className="text-gray-600">Searching...</p>
                </div>
              ) : userSearchResults.length > 0 ? (
                <div className="space-y-3">
                  {userSearchResults.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
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
                        <UserPlus className="w-4 h-4 mr-2" />
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              ) : userSearchQuery ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">No Users Found</h3>
                  <p className="text-sm text-gray-600">Try searching with a different name</p>
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">Search for People</h3>
                  <p className="text-sm text-gray-600">Enter a name to find other music lovers</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
