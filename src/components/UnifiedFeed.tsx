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
import { SynthSLogo } from '@/components/SynthSLogo';
import { ReviewService, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewModal } from '@/components/EventReviewModal';
import { ReviewCard as FeedReviewCard } from '@/components/reviews/ReviewCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventCommentsModal } from '@/components/events/EventCommentsModal';
import { EventLikersModal } from '@/components/events/EventLikersModal';
import { EventLikesService } from '@/services/eventLikesService';
import { ShareService } from '@/services/shareService';
import { UnifiedFeedService, UnifiedFeedItem } from '@/services/unifiedFeedService';
import { LocationService } from '@/services/locationService';
import { EventMap } from './EventMap';
import { UnifiedChatView } from './UnifiedChatView';
import { UserEventService } from '@/services/userEventService';

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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewEvent, setSelectedReviewEvent] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [showUnifiedChat, setShowUnifiedChat] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]); // Default to NYC
  const [mapZoom, setMapZoom] = useState(10);
  const { toast } = useToast();
  const { sessionExpired } = useAuth();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<any>(null);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const [openEventCommentsFor, setOpenEventCommentsFor] = useState<string | null>(null);
  const [openLikersFor, setOpenLikersFor] = useState<string | null>(null);

  useEffect(() => {
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    // Try to get user's location for better recommendations
    LocationService.getCurrentLocation()
      .then(location => {
        setUserLocation({ lat: location.latitude, lng: location.longitude });
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
      // This function can be implemented later to load upcoming events
      // For now, it's just a placeholder to prevent errors
      console.log('Loading upcoming events...');
    } catch (error) {
      console.error('Error loading upcoming events:', error);
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

  const handleShare = async (item: UnifiedFeedItem) => {
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
    <div className="min-h-screen synth-gradient-card">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-2">
            <SynthSLogo size="md" />
            <h1 className="synth-heading text-3xl">Concert Feed</h1>
          </div>
          <p className="synth-text text-muted-foreground">Discover concerts, reviews, and connect with the community</p>
        </div>
        
        <div className="flex items-center justify-end mb-6">
          
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
              onClick={() => setShowUnifiedChat(true)}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Feed Tabs */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              Reviews
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="events"
            className="space-y-4 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 220px)', paddingBottom: '80px' }}
          >
            {/* Demo Ad for Events Tab */}
            <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Music className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Madison Square Garden</h3>
                      <p className="text-sm text-gray-600">Premium venue advertising</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Ad
                  </Badge>
            </div>
                <div className="mt-3">
                  <p className="text-sm text-gray-700 mb-2">
                    🎵 <strong>Taylor Swift - The Eras Tour</strong> coming to MSG!
                  </p>
                  <p className="text-xs text-gray-600">
                    Experience the magic of live music at the world's most famous arena. 
                    Book your tickets now for an unforgettable night!
                  </p>
            </div>
          </CardContent>
        </Card>

            {/* Events Feed Items */}
        <div className="space-y-4">
              {feedItems
                .filter(item => item.type === 'event')
                .map((item) => (
              <Card 
                key={item.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={async (e) => {
                  if (e.defaultPrevented) return;
                  if (item.event_data) {
                    setSelectedEventForDetails(item.event_data);
                    try {
                      const interested = await UserEventService.isUserInterested(
                        currentUserId,
                        item.event_data.id
                      );
                      setSelectedEventInterested(interested);
                    } catch {
                      setSelectedEventInterested(false);
                    }
                    setDetailsOpen(true);
                  }
                }}
              >
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
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800 text-xs">
                            <Calendar className="w-3 h-3 mr-1" />
                            Event
                        </Badge>
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
                        onMouseDown={(e) => { e.stopPropagation(); }}
                        onClick={async (e) => { 
                          e.preventDefault(); 
                          e.stopPropagation(); 
                          // Optimistic toggle
                          setFeedItems(prev => prev.map(x => x.id === item.id ? { ...x, is_liked: !x.is_liked, likes_count: (x.likes_count || 0) + (x.is_liked ? -1 : 1) } : x));
                          try {
                            if (item.event_data) {
                              const liked = item.is_liked;
                              if (liked) {
                                await EventLikesService.unlikeEvent(currentUserId, item.event_data.id);
                              } else {
                                await EventLikesService.likeEvent(currentUserId, item.event_data.id);
                              }
                            }
                          } catch (err) {
                            // revert on error
                            setFeedItems(prev => prev.map(x => x.id === item.id ? { ...x, is_liked: item.is_liked, likes_count: item.likes_count } : x));
                          }
                        }}
                        className={`flex items-center gap-1 text-xs ${item.is_liked ? 'text-red-500' : 'text-gray-500'}`}
                      >
                        <Heart className={`w-3 h-3 ${item.is_liked ? 'fill-current' : ''}`} />
                        {item.likes_count || 0}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex items-center gap-1 text-xs text-gray-500"
                        onMouseDown={(e) => { e.stopPropagation(); }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (item.event_data) setOpenEventCommentsFor(item.event_data.id); }}
                      >
                        <MessageCircle className="w-3 h-3" />
                        {item.comments_count || 0}
                      </Button>
                      <button 
                        className="text-[10px] text-gray-500 underline"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (item.event_data) setOpenLikersFor(item.event_data.id); }}
                        aria-label="See who liked"
                      >
                        See likes
                      </button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onMouseDown={(e) => { e.stopPropagation(); }}
                        onClick={async (e) => { 
                          e.preventDefault(); 
                          e.stopPropagation(); 
                          if (item.event_data) {
                            const url = await ShareService.shareEvent(item.event_data.id, item.title, item.content || undefined);
                            toast({ title: 'Link copied', description: url });
                          }
                        }}
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
                ))}
              
              {/* Empty state for events */}
              {feedItems.filter(item => item.type === 'event').length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Events Yet</h3>
                  <p className="text-gray-600 text-sm">
                    Check back later for upcoming concert events in your area!
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="reviews"
            className="space-y-4 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 220px)', paddingBottom: '80px' }}
          >
            {/* Demo Ad for Reviews Tab */}
            <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                      <Star className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Billie Eilish</h3>
                      <p className="text-sm text-gray-600">Artist profile promotion</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                    Ad
                  </Badge>
                </div>
                <div className="mt-3">
                  <p className="text-sm text-gray-700 mb-2">
                    ⭐ <strong>Follow Billie Eilish</strong> for exclusive tour updates!
                  </p>
                  <p className="text-xs text-gray-600">
                    Get early access to concert announcements and behind-the-scenes content. 
                    Don't miss out on her next world tour!
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Reviews Feed Items */}
            <div className="space-y-4">
              {feedItems
                .filter(item => item.type === 'review')
                .map((item) => (
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
                          <Badge className="bg-purple-100 text-purple-800 text-xs">
                            <Star className="w-3 h-3 mr-1" />
                            Review
                          </Badge>
                          {item.rating && (
                            <Badge className={`${getRatingColor(item.rating)} border text-xs`}>
                              {getRatingIcon(item.rating)}
                              <span className="ml-1">{getRatingText(item.rating)}</span>
                            </Badge>
                          )}
                          {!item.is_public && (
                            <Badge variant="outline" className="text-xs">
                              {item.is_public ? <Globe className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                              {item.is_public ? 'Public' : 'Private'}
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

                      <FeedReviewCard
                        review={{
                          id: String(item.review_id || item.id).replace(/^public-review-/, ''),
                          user_id: item.author?.id || 'unknown',
                          event_id: '',
                          rating: item.rating || 0,
                          review_text: item.content || '',
                          likes_count: item.likes_count || 0,
                          comments_count: item.comments_count || 0,
                          shares_count: item.shares_count || 0,
                          created_at: item.created_at,
                          updated_at: item.created_at,
                          is_public: item.is_public ?? true,
                        } as any}
                        currentUserId={currentUserId}
                        showEventInfo={false}
                      />
                    </CardContent>
                  </Card>
                ))}
              
              {/* Empty state for reviews */}
              {feedItems.filter(item => item.type === 'review').length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg">
                  <Star className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Reviews Yet</h3>
                  <p className="text-gray-600 text-sm">
                    Start writing reviews about concerts you've attended to help others discover great shows!
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
          
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

      {/* Event Details Modal (for Events tab) */}
      <EventDetailsModal
        event={selectedEventForDetails}
        currentUserId={currentUserId}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onInterestToggle={async (eventId, interested) => {
          try {
            await UserEventService.setEventInterest(currentUserId, eventId, interested);
            setSelectedEventInterested(interested);
          } catch (e) {
            console.error('Failed to toggle interest from feed modal', e);
          }
        }}
        isInterested={selectedEventInterested}
      />

      {/* Inline Event Comments Modal from feed */}
      <EventCommentsModal
        eventId={openEventCommentsFor}
        isOpen={Boolean(openEventCommentsFor)}
        onClose={() => setOpenEventCommentsFor(null)}
        currentUserId={currentUserId}
        onCommentAdded={() => {
          // Optimistically bump count for the currently open event card
          if (!openEventCommentsFor) return;
          setFeedItems(prev => prev.map(item => {
            if (item.type === 'event' && item.event_data?.id === openEventCommentsFor) {
              return { ...item, comments_count: (item.comments_count || 0) + 1 };
            }
            return item;
          }));
        }}
        onCommentsLoaded={(count) => {
          // Sync count from server load in case it differs
          if (!openEventCommentsFor) return;
          setFeedItems(prev => prev.map(item => {
            if (item.type === 'event' && item.event_data?.id === openEventCommentsFor) {
              return { ...item, comments_count: count };
            }
            return item;
          }));
        }}
      />

      <EventLikersModal
        eventId={openLikersFor}
        isOpen={Boolean(openLikersFor)}
        onClose={() => setOpenLikersFor(null)}
      />

      {/* Full Page Chat */}
      {showUnifiedChat && (
        <UnifiedChatView 
          currentUserId={currentUserId} 
          onBack={() => setShowUnifiedChat(false)} 
        />
      )}

      {/* Bottom Navigation - Hide when chat is open */}
      {!showUnifiedChat && onViewChange && (
        <Navigation 
          currentView="feed" 
          onViewChange={onViewChange} 
        />
      )}
    </div>
  );
};
