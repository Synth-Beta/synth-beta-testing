import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { UnifiedArtistSearchService, ArtistSearchResult } from '@/services/unifiedArtistSearchService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Music, 
  Search, 
  Users, 
  UserPlus,
  Loader2,
  X,
  Calendar,
  ArrowLeft
} from 'lucide-react';
import { VerificationBadge } from '@/components/verification/VerificationBadge';
import type { AccountType } from '@/utils/verificationUtils';

interface SearchResultsPageProps {
  searchQuery: string;
  searchType: 'artists' | 'people';
  onBack: () => void;
  userId: string;
  onArtistSelect?: (artist: ArtistSearchResult) => void;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  username?: string;
  email?: string;
  account_type?: AccountType;
  verified?: boolean;
}

export function SearchResultsPage({ searchQuery, searchType, onBack, userId, onArtistSelect }: SearchResultsPageProps) {
  const [results, setResults] = useState<{
    artists: ArtistSearchResult[];
    users: UserProfile[];
  }>({ artists: [], users: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔍 Searching for: "${query}"`);
      
      // Search both artists and users
      const [artistResults, userResults] = await Promise.all([
        searchArtists(query, 50),
        searchUsers(query, 50)
      ]);
      
      console.log(`✅ Found ${artistResults.length} artists and ${userResults.length} users`);
      
      setResults({
        artists: artistResults,
        users: userResults
      });
    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      setResults({ artists: [], users: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const searchArtists = async (query: string, limit: number = 50): Promise<ArtistSearchResult[]> => {
    try {
      // Search results page: explicit search - call API for new results
      return await UnifiedArtistSearchService.searchArtists(query, limit, true);
    } catch (error) {
      console.error('Error searching artists:', error);
      return [];
    }
  };

  const searchUsers = async (query: string, limit: number = 50): Promise<UserProfile[]> => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', `%${query}%`)
        .neq('user_id', userId)
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

  const displayResults = searchType === 'artists' ? results.artists : results.users;
  const totalResults = searchType === 'artists' ? results.artists.length : results.users.length;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-4 p-0 h-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {searchType === 'artists' ? 'Artists' : 'People'} Results
          </h1>
          <p className="text-gray-600">
            Showing {totalResults} results for "{searchQuery}"
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Searching...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayResults.map((item, index) => (
              <Card key={item.id || index} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  {searchType === 'artists' ? (
                    // Artist Result
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          {(item as ArtistSearchResult).image_url ? (
                            <img
                              src={(item as ArtistSearchResult).image_url}
                              alt={(item as ArtistSearchResult).name}
                              className="w-16 h-16 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center ${(item as ArtistSearchResult).image_url ? 'hidden' : ''}`}>
                            <Music className="h-8 w-8 text-gray-400" />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            {(item as ArtistSearchResult).name}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            {(item as ArtistSearchResult).band_or_musician && (
                              <Badge variant="outline" className="capitalize">
                                {(item as ArtistSearchResult).band_or_musician}
                              </Badge>
                            )}
                            {(item as ArtistSearchResult).num_upcoming_events && (item as ArtistSearchResult).num_upcoming_events > 0 && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>{(item as ArtistSearchResult).num_upcoming_events} upcoming events</span>
                              </div>
                            )}
                          </div>
                          {(item as ArtistSearchResult).genres && (item as ArtistSearchResult).genres.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(item as ArtistSearchResult).genres.map((genre, genreIndex) => (
                                <Badge key={genreIndex} variant="secondary" className="text-xs">
                                  {genre}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Choose Button for Artists */}
                      <div className="flex-shrink-0">
                        <Button
                          onClick={() => {
                            console.log('Artist chosen:', (item as ArtistSearchResult));
                            if (onArtistSelect) {
                              onArtistSelect(item as ArtistSearchResult);
                            } else {
                              toast({
                                title: "Artist Selected",
                                description: `You selected ${(item as ArtistSearchResult).name}`,
                              });
                            }
                          }}
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          Choose Artist
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // User Result
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-16 h-16">
                          <AvatarImage src={(item as UserProfile).avatar_url || undefined} />
                          <AvatarFallback>
                            {(item as UserProfile).name ? (item as UserProfile).name.split(' ').map(n => n[0]).join('') : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-semibold text-gray-900">
                              {(item as UserProfile).name || 'Unknown User'}
                            </h3>
                            {(item as UserProfile).verified && (item as UserProfile).account_type && (
                              <VerificationBadge
                                accountType={(item as UserProfile).account_type!}
                                verified={(item as UserProfile).verified!}
                                size="md"
                              />
                            )}
                          </div>
                          {(item as UserProfile).bio && (
                            <p className="text-gray-600 mt-1">{(item as UserProfile).bio}</p>
                          )}
                          {(item as UserProfile).instagram_handle && (
                            <p className="text-sm text-gray-500 mt-1">@{((item as UserProfile).instagram_handle)}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => sendFriendRequest((item as UserProfile).user_id)}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Connect
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {displayResults.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Found</h3>
                <p className="text-gray-600">Try searching with different terms</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
