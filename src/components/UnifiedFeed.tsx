import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Music, 
  Heart, 
  MessageCircle, 
  Share2, 
  MapPin, 
  Calendar,
  Star,
  Globe,
  Users,
  Search,
  Filter,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Bell,
  Navigation as NavigationIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { ReviewService, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewModal } from '@/components/EventReviewModal';
import { ReviewCard } from '@/components/ReviewCard';
import { JamBaseEventsService, JamBaseEventResponse } from '@/services/jambaseEventsService';
import { LocationService } from '@/services/locationService';
import { UnifiedFeedService, UnifiedFeedItem } from '@/services/unifiedFeedService';
import { EventMap } from './EventMap';

// Using UnifiedFeedItem from service instead of local interface

interface UnifiedFeedProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToChat?: () => void;
  onNavigateToNotifications?: () => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

export const UnifiedFeed = ({ 
  currentUserId, 
  onBack, 
  onNavigateToChat, 
  onNavigateToNotifications, 
  onViewChange 
}: UnifiedFeedProps) => {
  const [feedItems, setFeedItems] = useState<UnifiedFeedItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<JamBaseEventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [mapLocation, setMapLocation] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // Center of US
  const [mapZoom, setMapZoom] = useState(4);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewEvent, setSelectedReviewEvent] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const { toast } = useToast();
  const { sessionExpired } = useAuth();

  useEffect(() => {
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    // Try to get user's location for better recommendations
    LocationService.getCurrentLocation()
      .then(location => {
        setUserLocation(location);
        setMapCenter([location.latitude, location.longitude]);
        setMapZoom(10);
      })
      .catch(error => {
        console.log('Could not get user location:', error);
        // Continue without location
      })
      .finally(() => {
        loadFeedData();
        loadUpcomingEvents();
      });
  }, [currentUserId, sessionExpired]);

  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop
        >= document.documentElement.offsetHeight - 1000 &&
        !loadingMore &&
        hasMore
      ) {
        loadFeedData(feedItems.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, feedItems.length]);

  const loadFeedData = async (offset: number = 0) => {
    try {
      if (offset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const items = await UnifiedFeedService.getFeedItems({
        userId: currentUserId,
        limit: 20,
        offset,
        userLocation,
        includePrivateReviews: true
      });

      if (offset === 0) {
        setFeedItems(items);
      } else {
        setFeedItems(prev => [...prev, ...items]);
      }

      setHasMore(items.length === 20); // If we got fewer than requested, no more items
      
    } catch (error) {
      console.error('Error loading feed data:', error);
      toast({
        title: "Error",
        description: "Failed to load feed data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      // Get events from database
      const { data: events, error } = await supabase
        .from('jambase_events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('event_date', { ascending: true })
        .limit(50);

      if (error) throw error;

      const transformedEvents: JamBaseEventResponse[] = (events || []).map(event => ({
        id: event.id,
        jambase_event_id: event.jambase_event_id,
        title: event.title,
        artist_name: event.artist_name,
        artist_id: event.artist_id || '',
        venue_name: event.venue_name,
        venue_id: event.venue_id || '',
        event_date: event.event_date,
        doors_time: event.doors_time,
        description: event.description,
        genres: event.genres,
        venue_address: event.venue_address,
        venue_city: event.venue_city,
        venue_state: event.venue_state,
        venue_zip: event.venue_zip,
        latitude: event.latitude ? Number(event.latitude) : undefined,
        longitude: event.longitude ? Number(event.longitude) : undefined,
        ticket_available: event.ticket_available,
        price_range: event.price_range,
        ticket_urls: event.ticket_urls,
        setlist: event.setlist,
        tour_name: event.tour_name,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));

      setUpcomingEvents(transformedEvents);
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    }
  };

  const handleLocationSearch = async () => {
    if (!mapLocation.trim()) return;

    try {
      const result = await LocationService.searchEventsByCity(mapLocation, 25, 100);
      
      if (result.city) {
        setMapCenter([result.city.lat, result.city.lng]);
        setMapZoom(10);
        setUpcomingEvents(result.events);
        toast({
          title: "Location Found",
          description: `Found ${result.events.length} events near ${result.city.name}`,
        });
      } else {
        toast({
          title: "Location Not Found",
          description: "Try searching for a major city like 'New York' or 'Los Angeles'",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error searching location:', error);
      toast({
        title: "Search Error",
        description: "Failed to search for location",
        variant: "destructive",
      });
    }
  };

  const handleLike = async (itemId: string) => {
    try {
      setFeedItems(prev => 
        prev.map(item => 
          item.id === itemId 
            ? { 
                ...item, 
                is_liked: !item.is_liked,
                likes_count: (item.likes_count || 0) + (item.is_liked ? -1 : 1)
              }
            : item
        )
      );
      
      toast({
        title: "Like Updated",
        description: "Your like has been updated!",
      });
    } catch (error) {
      console.error('Error liking item:', error);
    }
  };

  const handleShare = async (item: FeedItem) => {
    try {
      const shareText = `Check out this ${item.type}: ${item.title}`;
      await navigator.clipboard.writeText(shareText);
      
      toast({
        title: "Shared!",
        description: "Link copied to clipboard",
      });
    } catch (error) {
      console.error('Error sharing item:', error);
    }
  };

  const getRatingText = (rating: number) => {
    if (rating >= 4) return 'Good';
    if (rating >= 2) return 'Okay';
    return 'Bad';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'bg-green-100 text-green-800 border-green-200';
    if (rating >= 2) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getRatingIcon = (rating: number) => {
    if (rating >= 4) return <ThumbsUp className="w-4 h-4" />;
    if (rating >= 2) return <Minus className="w-4 h-4" />;
    return <ThumbsDown className="w-4 h-4" />;
  };

  const getItemTypeIcon = (type: string) => {
    switch (type) {
      case 'review': return <Star className="w-3 h-3" />;
      case 'event': return <Calendar className="w-3 h-3" />;
      case 'friend_activity': return <Users className="w-3 h-3" />;
      case 'system_news': return <Globe className="w-3 h-3" />;
      default: return <Music className="w-3 h-3" />;
    }
  };

  const getItemTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'review': return 'bg-purple-100 text-purple-800';
      case 'event': return 'bg-blue-100 text-blue-800';
      case 'friend_activity': return 'bg-green-100 text-green-800';
      case 'system_news': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Concert Feed</h1>
            <p className="text-gray-600 mt-2">Discover concerts, reviews, and connect with the community</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="relative p-2"
              onClick={() => onNavigateToNotifications?.()}
            >
              <Bell className="w-5 h-5" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="p-2"
              onClick={() => onNavigateToChat?.()}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Event Map */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Upcoming Events Near You
            </CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Enter city name (e.g., New York, Los Angeles)"
                value={mapLocation}
                onChange={(e) => setMapLocation(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLocationSearch()}
                className="flex-1"
              />
              <Button onClick={handleLocationSearch} variant="outline">
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full h-64 rounded-lg overflow-hidden">
              <EventMap
                center={mapCenter}
                zoom={mapZoom}
                events={upcomingEvents}
                onEventClick={(event) => {
                  setSelectedReviewEvent(event);
                  setShowReviewModal(true);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Feed Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Your Feed</h2>
            <p className="text-sm text-gray-600">
              Reviews, events, and updates from your music community
            </p>
          </div>
          {userLocation && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <NavigationIcon className="w-3 h-3" />
              Personalized for your location
            </div>
          )}
        </div>

        {/* Feed Items */}
        <div className="space-y-4">
          {feedItems.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg">
              <Music className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Content Yet</h3>
              <p className="text-gray-600 text-sm">
                Start exploring concerts and writing reviews to build your feed!
              </p>
            </div>
          ) : (
            feedItems.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={item.author?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {item.author?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-sm text-gray-900">{item.author?.name || 'Anonymous'}</h3>
                        <p className="text-xs text-gray-500">
                          {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                          {!item.is_public && item.type === 'review' && (
                            <Badge variant="outline" className="ml-2 text-xs">Private</Badge>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Item type badge */}
                      <Badge className={`${getItemTypeBadgeColor(item.type)} text-xs`}>
                        {getItemTypeIcon(item.type)}
                        <span className="ml-1 capitalize">{item.type.replace('_', ' ')}</span>
                      </Badge>
                      
                      {/* Rating badge for reviews */}
                      {item.type === 'review' && item.rating && (
                        <Badge className={`${getRatingColor(item.rating)} border text-xs`}>
                          {getRatingIcon(item.rating)}
                          <span className="ml-1">{getRatingText(item.rating)}</span>
                        </Badge>
                      )}
                      
                      {/* Privacy badge for reviews */}
                      {item.type === 'review' && (
                        <Badge variant="outline" className="text-xs">
                          {item.is_public ? <Globe className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                          {item.is_public ? 'Public' : 'Private'}
                        </Badge>
                      )}
                      
                      {/* Distance badge for events */}
                      {item.distance_miles && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="w-3 h-3 mr-1" />
                          {Math.round(item.distance_miles)} mi
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mb-3">
                    <h4 className="text-lg font-semibold text-gray-900 mb-1">
                      {item.event_info?.event_name || item.title}
                    </h4>
                    {item.event_info && (
                      <p className="text-sm text-gray-600 mb-2">
                        {item.event_info.venue_name} • {(() => {
                          try {
                            return format(parseISO(item.event_info.event_date || item.created_at), 'MMM d, yyyy');
                          } catch {
                            return item.event_info.event_date || item.created_at;
                          }
                        })()}
                        {item.event_info.artist_name && ` • ${item.event_info.artist_name}`}
                      </p>
                    )}
                    {item.content && (
                      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                        {item.content}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLike(item.id)}
                        className={`flex items-center gap-1 text-xs ${item.is_liked ? 'text-red-500' : 'text-gray-500'}`}
                      >
                        <Heart className={`w-3 h-3 ${item.is_liked ? 'fill-current' : ''}`} />
                        {item.likes_count || 0}
                      </Button>
                      <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs text-gray-500">
                        <MessageCircle className="w-3 h-3" />
                        {item.comments_count || 0}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleShare(item)}
                        className="flex items-center gap-1 text-xs text-gray-500"
                      >
                        <Share2 className="w-3 h-3" />
                        {item.shares_count || 0}
                      </Button>
                    </div>
                    <span className="text-xs text-gray-500">
                      {(() => {
                        try {
                          return format(parseISO(item.created_at), 'MMM d, h:mm a');
                        } catch {
                          return item.created_at;
                        }
                      })()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          
          {/* Loading more indicator */}
          {loadingMore && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading more...</p>
            </div>
          )}
          
          {/* End of feed indicator */}
          {!hasMore && feedItems.length > 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-px bg-gray-300 mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">You're all caught up!</p>
              <p className="text-xs text-gray-400 mt-1">Check back later for new content</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      {onViewChange && (
        <Navigation 
          currentView="feed" 
          onViewChange={onViewChange} 
        />
      )}

      {/* Review Modal */}
      <EventReviewModal
        event={selectedReviewEvent}
        userId={currentUserId}
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onReviewSubmitted={() => {
          loadFeedData();
          setShowReviewModal(false);
        }}
      />
    </div>
  );
};
