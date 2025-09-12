import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnifiedEventSearch } from './UnifiedEventSearch';
import { ConcertSearchResults } from './ConcertSearchResults';
import { concertSearchService } from '@/services/concertSearchService';
import type { Event } from '@/types/concertSearch';
import type { EventSelectionResult } from '@/services/hybridSearchService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Music, 
  Calendar, 
  MapPin, 
  Search, 
  Users, 
  UserPlus,
  Loader2
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
  const [activeTab, setActiveTab] = useState('events');
  const [searchResults, setSearchResults] = useState<{
    event: Event | null;
    isNewEvent: boolean;
    source: string;
  } | null>(null);
  const [userEvents, setUserEvents] = useState<Event[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const { toast } = useToast();

  // Load user's events on component mount
  useEffect(() => {
    loadUserEvents();
  }, [userId]);

  // Handle user search
  useEffect(() => {
    if (activeTab === 'profiles') {
      searchUsers(userSearchQuery);
    }
  }, [userSearchQuery, activeTab]);

  const loadUserEvents = async () => {
    try {
      setIsLoading(true);
      const result = await concertSearchService.getUserEvents(userId);
      setUserEvents(result.events);
    } catch (error) {
      console.error('Error loading user events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEventSelected = (result: EventSelectionResult) => {
    setSearchResults({
      event: result.event,
      isNewEvent: result.isNewEvent,
      source: result.source
    });
    
    // Reload user events to show the new one
    loadUserEvents();
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

      setUserSearchResults(profiles || []);
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

  const formatEventDate = (dateString: string, timeString?: string) => {
    try {
      const date = new Date(dateString);
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (timeString) {
        const time = new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${formattedDate} at ${time}`;
      }
      
      return formattedDate;
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            People
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-6 space-y-6">
          {/* Event Search */}
          <UnifiedEventSearch onEventSelected={handleEventSelected} userId={userId} />

          {/* Event Search Results */}
          {searchResults && (
            <ConcertSearchResults 
              event={searchResults.event} 
              isNewEvent={searchResults.isNewEvent} 
              source={searchResults.source} 
            />
          )}

          {/* User's Events */}
          {userEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  Your Events
                </CardTitle>
                <CardDescription>
                  Events you've searched for and added to your profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {userEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{event.title || event.event_name}</h4>
                        <p className="text-sm text-gray-600">
                          {event.artist_name} at {event.venue_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatEventDate(event.event_date, event.event_time || undefined)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {event.jambase_event_id ? 'JamBase' : 'Manual'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
