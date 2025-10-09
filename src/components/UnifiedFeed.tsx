"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
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
  Navigation as NavigationIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { SynthSLogo } from '@/components/SynthSLogo';
import { getEventStatus, isEventPast, getPastEvents, getUpcomingEvents } from '@/utils/eventStatusUtils';
import { ReviewService, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewModal } from '@/components/EventReviewModal';
import { ReviewCard as FeedReviewCard } from '@/components/reviews/ReviewCard';
import { ProfileReviewCard } from '@/components/reviews/ProfileReviewCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventCommentsModal } from '@/components/events/EventCommentsModal';
import { ReviewCommentsModal } from '@/components/reviews/ReviewCommentsModal';
import { EventLikersModal } from '@/components/events/EventLikersModal';
import { EventLikesService } from '@/services/eventLikesService';
import { EventShareModal } from '@/components/events/EventShareModal';
import { ShareService } from '@/services/shareService';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UnifiedFeedService, UnifiedFeedItem } from '@/services/unifiedFeedService';
import { LocationService } from '@/services/locationService';
import { EventMap } from './EventMap';
import { UnifiedChatView } from './UnifiedChatView';
import { UserEventService } from '@/services/userEventService';
import { extractNumericPrice } from '@/utils/currencyUtils';

// Using UnifiedFeedItem from service instead of local interface

interface UnifiedFeedProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const UnifiedFeed = ({ 
  currentUserId, 
  onBack, 
  onNavigateToNotifications, 
  onViewChange,
  onNavigateToProfile,
  onNavigateToChat
}: UnifiedFeedProps) => {
  // Debug: Check if navigation handlers are provided
  console.log('🔍 UnifiedFeed navigation handlers:', {
    onNavigateToProfile: !!onNavigateToProfile,
    onNavigateToChat: !!onNavigateToChat
  });
  
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
  const [openReviewCommentsFor, setOpenReviewCommentsFor] = useState<string | null>(null);
  const [openLikersFor, setOpenLikersFor] = useState<string | null>(null);
  const [viewReviewOpen, setViewReviewOpen] = useState(false);
  const [selectedReviewForView, setSelectedReviewForView] = useState<any>(null);
  const [showCommentsInModal, setShowCommentsInModal] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'price' | 'popularity' | 'distance'>('relevance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // In-app sharing state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedEventForShare, setSelectedEventForShare] = useState<any>(null);

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

  // Check if we need to re-open an event modal after returning from artist/venue page
  useEffect(() => {
    // Check localStorage for an event ID to re-open
    const reopenEventId = localStorage.getItem('reopenEventId');
    console.log('🔍 UnifiedFeed: Checking for reopenEventId in localStorage:', reopenEventId);
    console.log('🔍 UnifiedFeed: feedItems.length:', feedItems.length);
    
    if (reopenEventId && feedItems.length > 0) {
      console.log('🔍 UnifiedFeed: Looking for event with id:', reopenEventId);
      
      // Find the event in feed items
      const eventItem = feedItems.find(item => 
        item.type === 'event' && item.event_data?.id === reopenEventId
      );
      
      console.log('🔍 UnifiedFeed: Found eventItem:', eventItem);
      
      if (eventItem && eventItem.event_data) {
        console.log('✅ UnifiedFeed: Re-opening modal for event:', eventItem.event_data);
        // Re-open the modal for this event
        setSelectedEventForDetails(eventItem.event_data);
        setDetailsOpen(true);
        
        // Clear localStorage so we don't re-open it again
        localStorage.removeItem('reopenEventId');
      }
    }
  }, [feedItems]);

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

      // Add minimum loading time for better UX demonstration
      const minLoadingTime = offset === 0 ? new Promise(resolve => setTimeout(resolve, 800)) : Promise.resolve();

      const [items] = await Promise.all([
        UnifiedFeedService.getFeedItems({
          userId: currentUserId,
          limit: 20,
          offset,
          includePrivateReviews: true
        }),
        minLoadingTime
      ]);

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

  // Sort feed items based on selected criteria
  const sortFeedItems = (items: UnifiedFeedItem[]) => {
    return [...items].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date': {
          // For events, prefer event_date over created_at
          const dateA = a.type === 'event' && a.event_data?.event_date 
            ? new Date(a.event_data.event_date).getTime()
            : new Date(a.created_at).getTime();
          const dateB = b.type === 'event' && b.event_data?.event_date 
            ? new Date(b.event_data.event_date).getTime()
            : new Date(b.created_at).getTime();
          comparison = dateA - dateB;
          break;
        }
          
        case 'price': {
          // Extract numeric price from price_range for events
          const priceA = extractPrice(a);
          const priceB = extractPrice(b);
          comparison = priceA - priceB;
          break;
        }
          
        case 'popularity': {
          const popularityA = (a.likes_count || 0) + (a.comments_count || 0) + (a.shares_count || 0);
          const popularityB = (b.likes_count || 0) + (b.comments_count || 0) + (b.shares_count || 0);
          comparison = popularityA - popularityB;
          break;
        }
          
        case 'distance': {
          const distanceA = a.distance_miles || Infinity;
          const distanceB = b.distance_miles || Infinity;
          comparison = distanceA - distanceB;
          break;
        }
          
        case 'relevance':
        default:
          // Handle undefined relevance scores
          const relevanceA = a.relevance_score ?? 0;
          const relevanceB = b.relevance_score ?? 0;
          comparison = relevanceA - relevanceB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  // Extract numeric price from price_range string
  const extractPrice = (item: UnifiedFeedItem): number => {
    if (item.type === 'event' && item.event_data?.price_range) {
      const price = extractNumericPrice(item.event_data.price_range);
      return price;
    }
    return 0;
  };

  // Get sorted feed items
  const sortedFeedItems = useMemo(() => {
    return sortFeedItems(feedItems);
  }, [feedItems, sortBy, sortOrder]);

  // Hero image resolver for review items (mirrors JamBaseEventCard logic exactly)
  const ReviewHeroImage: React.FC<{ item: UnifiedFeedItem }> = ({ item }) => {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
      (async () => {
        try {
          console.log('ReviewHeroImage: Resolving image for item:', item.id, 'photos:', item.photos, 'artist:', item.event_info?.artist_name);
          
          // 1) try a user review photo for this specific review
          if (Array.isArray(item.photos) && item.photos.length > 0) {
            console.log('ReviewHeroImage: Using item photos:', item.photos[0]);
            setUrl(item.photos[0] as any);
            return;
          }

          const artistName = item.event_info?.artist_name || '';
          if (!artistName) { 
            console.log('ReviewHeroImage: No artist name, setting null');
            setUrl(null); 
            return; 
          }

          // 2) try artist image via any review that carries photos for this artist
          const artist = await (supabase as any)
            .from('user_reviews')
            .select('photos, jambase_events!inner(artist_name)')
            .not('photos', 'is', null)
            .ilike('jambase_events.artist_name', `%${artistName}%`)
            .order('likes_count', { ascending: false })
            .limit(1);
          const artistImg = Array.isArray(artist.data) && artist.data[0]?.photos?.[0];
          if (artistImg) { 
            console.log('ReviewHeroImage: Using artist review photo:', artistImg);
            setUrl(artistImg); 
            return; 
          }

          // 3) try most-liked review photo for same artist across events (same as step 2, but explicit)
          const byArtist = await (supabase as any)
            .from('user_reviews')
            .select('photos, jambase_events!inner(artist_name)')
            .not('photos', 'is', null)
            .ilike('jambase_events.artist_name', `%${artistName}%`)
            .order('likes_count', { ascending: false })
            .limit(1);
          const artistPhoto = Array.isArray(byArtist.data) && byArtist.data[0]?.photos?.[0];
          if (artistPhoto) { 
            console.log('ReviewHeroImage: Using popular artist photo:', artistPhoto);
            setUrl(artistPhoto); 
            return; 
          }
          
          console.log('ReviewHeroImage: No image found, setting null');
          setUrl(null);
        } catch (error) {
          console.error('ReviewHeroImage: Error resolving image:', error);
          setUrl(null);
        }
      })();
    }, [item.id, item.photos, item.event_info?.artist_name]);

    console.log('ReviewHeroImage: Rendering with url:', url);
    if (!url) return null;
    return (
      <div className="h-44 w-full overflow-hidden rounded-t-lg">
        <img src={url} alt={item.event_info?.event_name || item.title} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  };

  // (Reverted) No custom EventHeroImage in unified feed

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-4xl mx-auto p-6 space-y-6 w-full">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen synth-gradient-card">
      <div className="max-w-4xl mx-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="glass-card inner-glow text-center space-y-2 p-4 mb-4 floating-shadow">
          <div className="flex items-center justify-center gap-3">
            <SynthSLogo size="sm" className="hover-icon" />
            <h1 className="gradient-text text-3xl font-bold">Concert Feed</h1>
          </div>
          <p className="text-gray-600 text-sm">Discover concerts, reviews, and connect with the community</p>
        </div>
        
        <div className="glass-card inner-glow flex items-center justify-between px-6 py-3 sticky top-4 z-30">
          {/* Sort Controls */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4" />
              Sort by:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="synth-input text-sm bg-white/80 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2 min-w-[120px]"
            >
              <option value="relevance">Relevance</option>
              <option value="date">Date</option>
              <option value="price">Price</option>
              <option value="popularity">Popularity</option>
              <option value="distance">Distance</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-2 bg-white/80 backdrop-blur-sm border border-border/50 hover:border-synth-pink/50"
              title={`Sort ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
            >
              {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </Button>
          </div>
          
          <div className="flex items-center gap-3">
            <NotificationBell
              onClick={() => onNavigateToNotifications?.()}
              className="p-2"
            />
            
            <button
              className="p-2 hover-icon"
              onClick={() => setShowUnifiedChat(true)}
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feed Tabs */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/60 backdrop-blur-sm border border-white/20 rounded-2xl p-1">
            <TabsTrigger value="events" className="flex items-center gap-2 data-[state=active]:bg-synth-pink data-[state=active]:text-white rounded-xl">
              <Calendar className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2 data-[state=active]:bg-synth-pink data-[state=active]:text-white rounded-xl">
              <Star className="w-4 h-4" />
              Reviews
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="events"
            className="space-y-4"
          >
            {/* Demo Ad for Events Tab */}
            <Card className="border-2 border-blue-200/50 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <Music className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">Madison Square Garden</h3>
                      <p className="text-sm text-gray-600">Premium venue advertising</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                    Ad
                  </Badge>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-700 mb-3">
                    🎵 <strong>Taylor Swift - The Eras Tour</strong> coming to MSG!
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Experience the magic of live music at the world's most famous arena. 
                    Book your tickets now for an unforgettable night!
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Events Feed Items */}
        <div className="space-y-4">
              {sortedFeedItems
                .filter(item => item.type === 'event')
                .map((item, index) => (
              <Card 
                key={`event-${item.id}-${index}`} 
                className="cursor-pointer overflow-hidden group"
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
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 ring-2 ring-synth-pink/20">
                        <AvatarImage src={item.author?.avatar_url || undefined} />
                        <AvatarFallback className="text-sm font-semibold bg-synth-pink/10 text-synth-pink">
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
                      <Badge className="synth-badge text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        Event
                      </Badge>
                      {item.distance_miles && (
                        <Badge variant="outline" className="text-xs bg-synth-beige/20 text-synth-black border-synth-beige-dark">
                          <MapPin className="w-3 h-3 mr-1" />
                          {Math.round(item.distance_miles)} mi
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-xl font-bold text-gray-900 mb-2 synth-heading">
                      {item.event_info?.event_name || item.title}
                    </h4>
                    {item.event_info && (
                      <p className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                        <span className="bg-synth-beige/20 px-2 py-1 rounded-lg text-xs font-medium">
                          {item.event_info.venue_name}
                        </span>
                        <span>•</span>
                        <span className="bg-synth-pink/10 px-2 py-1 rounded-lg text-xs font-medium text-synth-pink">
                          {(() => {
                            try {
                              return format(parseISO(item.event_info.event_date || item.created_at), 'MMM d, yyyy');
                            } catch {
                              return item.event_info.event_date || item.created_at;
                            }
                          })()}
                        </span>
                      </p>
                    )}
                    {item.content && (
                      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 bg-gray-50/50 p-3 rounded-lg">
                        {item.content}
                      </p>
                    )}
                    {/* Setlist display for past events */}
                    {item.event_data && isEventPast(item.event_data.event_date) && item.event_data.setlist && (
                      <div className="mt-3 p-3 bg-gradient-to-r from-purple-50/80 to-pink-50/80 rounded-lg border border-purple-200/50">
                        <div className="flex items-center gap-2">
                          <Music className="w-4 h-4 text-purple-600" />
                          <span className="text-sm font-semibold text-purple-900">Setlist Available</span>
                          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                            {item.event_data.setlist_song_count ? `${item.event_data.setlist_song_count} songs` : 'Setlist'}
                          </Badge>
                        </div>
                        <p className="text-xs text-purple-700 mt-1">Click to view the full setlist from this show</p>
                      </div>
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
                      {/* Unified Share Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            className="flex items-center gap-1 text-xs text-pink-500 hover:text-pink-600"
                            title="Share event"
                          >
                            <Share2 className="w-3 h-3" />
                            Share
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 bg-white/95 backdrop-blur-sm border shadow-lg">
                          {currentUserId && (
                            <DropdownMenuItem
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (item.event_data) {
                                  setSelectedEventForShare(item.event_data);
                                  setShareModalOpen(true);
                                }
                              }}
                              className="cursor-pointer bg-white hover:bg-gray-50"
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Share with Synth Friends
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (item.event_data) {
                                try {
                                  const url = await ShareService.shareEvent(item.event_data.id, item.title, item.content || undefined);
                                  
                                  // Try Web Share API first
                                  if (navigator.share) {
                                    await navigator.share({
                                      title: item.title,
                                      text: item.content || 'Check out this event!',
                                      url: url
                                    });
                                  } else {
                                    // Fallback to copying link
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: 'Link copied', description: url });
                                  }
                                } catch (error) {
                                  // Fallback to copying link if Web Share fails
                                  const url = await ShareService.shareEvent(item.event_data.id, item.title, item.content || undefined);
                                  await navigator.clipboard.writeText(url);
                                  toast({ title: 'Link copied', description: url });
                                }
                              }
                            }}
                            className="cursor-pointer bg-white hover:bg-gray-50"
                          >
                            <Globe className="w-4 h-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (item.event_data) {
                                const url = await ShareService.shareEvent(item.event_data.id, item.title, item.content || undefined);
                                await navigator.clipboard.writeText(url);
                                toast({ title: 'Link copied', description: url });
                              }
                            }}
                            className="cursor-pointer bg-white hover:bg-gray-50"
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Copy Link
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              {sortedFeedItems.filter(item => item.type === 'event').length === 0 && !loading && (
                <EmptyState
                  icon={<Calendar className="w-16 h-16" />}
                  title="No Events Yet"
                  description="Check back later for upcoming concert events in your area!"
                  action={{
                    label: "Refresh Feed",
                    onClick: () => loadFeedData()
                  }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="reviews"
            className="space-y-4"
          >
            {/* Demo Ad for Reviews Tab */}
            <Card className="border-2 border-purple-200/50 bg-gradient-to-r from-purple-50/80 to-pink-50/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <Star className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">Billie Eilish</h3>
                      <p className="text-sm text-gray-600">Artist profile promotion</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
                    Ad
                  </Badge>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-700 mb-3">
                    ⭐ <strong>Follow Billie Eilish</strong> for exclusive tour updates!
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Get early access to concert announcements and behind-the-scenes content. 
                    Don't miss out on her next world tour!
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Reviews Feed Items */}
            <div className="space-y-4">
              {sortedFeedItems
                .filter(item => item.type === 'review')
                .map((item, index) => (
                  <Card 
                    key={`review-${item.id}-${index}`} 
                    className="cursor-pointer overflow-hidden group"
                    onClick={() => {
                      setSelectedReviewForView(item);
                      setShowCommentsInModal(false);
                      setViewReviewOpen(true);
                    }}
                  >
                    {/* Review hero image (user photo → artist image → popular review image) */}
                    <ReviewHeroImage item={item} />
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-12 h-12 ring-2 ring-purple-100">
                            <AvatarImage src={item.author?.avatar_url || undefined} />
                            <AvatarFallback className="text-sm font-semibold bg-purple-100 text-purple-700">
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
                          {!item.is_public && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              {item.is_public ? <Globe className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                              {item.is_public ? 'Public' : 'Private'}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Enhanced Star Rating Display */}
                      {item.rating && (
                        <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50/80 to-amber-50/80 rounded-2xl border border-yellow-200/50 backdrop-blur-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                {Array.from({ length: 5 }, (_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-6 h-6 ${
                                      i < Math.floor(item.rating) 
                                        ? 'text-yellow-500 fill-yellow-500' 
                                        : i < item.rating 
                                        ? 'text-yellow-500 fill-yellow-500' 
                                        : 'text-gray-300 fill-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-3xl font-bold text-gray-900">{item.rating.toFixed(1)}</span>
                            </div>
                            <Badge className={`${getRatingColor(item.rating)} border px-3 py-1 rounded-full`}>
                              {getRatingIcon(item.rating)}
                              <span className="ml-1 font-medium">{getRatingText(item.rating)}</span>
                            </Badge>
                          </div>
                        </div>
                      )}

                      <div className="mb-4">
                        <h4 className="text-xl font-bold text-gray-900 mb-2 synth-heading">
                          {item.event_info?.event_name || item.title}
                        </h4>
                        {item.event_info && (
                          <p className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                            <span className="bg-synth-beige/20 px-2 py-1 rounded-lg text-xs font-medium">
                              {item.event_info.venue_name}
                            </span>
                            <span>•</span>
                            <span className="bg-synth-pink/10 px-2 py-1 rounded-lg text-xs font-medium text-synth-pink">
                              {(() => {
                                try {
                                  return format(parseISO(item.event_info.event_date || item.created_at), 'MMM d, yyyy');
                                } catch {
                                  return item.event_info.event_date || item.created_at;
                                }
                              })()}
                            </span>
                          </p>
                        )}
                        {item.content && (
                          <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 bg-gray-50/50 p-3 rounded-lg">
                            {item.content}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`flex items-center gap-1 text-xs ${item.is_liked ? 'text-red-500' : 'text-gray-500'}`}
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onClick={async (e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              
                              console.log('🔍 UnifiedFeed: Review like clicked', {
                                itemId: item.id,
                                reviewId: item.review_id || item.id,
                                currentUserId,
                                isLiked: item.is_liked,
                                likesCount: item.likes_count
                              });
                              
                              // Optimistic toggle
                              setFeedItems(prev => prev.map(x => x.id === item.id ? { ...x, is_liked: !x.is_liked, likes_count: (x.likes_count || 0) + (x.is_liked ? -1 : 1) } : x));
                              try {
                                if (item.review_id || item.id) {
                                  const reviewId = item.review_id || item.id;
                                  const liked = item.is_liked;
                                  console.log('🔍 UnifiedFeed: Calling ReviewService', { reviewId, liked });
                                  
                                  if (liked) {
                                    await ReviewService.unlikeReview(currentUserId, reviewId);
                                    console.log('✅ UnifiedFeed: Review unliked successfully');
                                  } else {
                                    await ReviewService.likeReview(currentUserId, reviewId);
                                    console.log('✅ UnifiedFeed: Review liked successfully');
                                  }
                                } else {
                                  console.log('❌ UnifiedFeed: No review ID found');
                                }
                              } catch (err) {
                                console.error('❌ UnifiedFeed: Error toggling review like:', err);
                                // revert on error
                                setFeedItems(prev => prev.map(x => x.id === item.id ? { ...x, is_liked: item.is_liked, likes_count: item.likes_count } : x));
                              }
                            }}
                          >
                            <Heart className={`w-3 h-3 ${item.is_liked ? 'fill-current' : ''}`} />
                            {item.likes_count || 0}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center gap-1 text-xs text-gray-500"
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              console.log('🔍 UnifiedFeed: Review comment clicked', { itemId: item.id, reviewId: item.review_id || item.id });
                              // Open the review comments modal
                              setOpenReviewCommentsFor(item.review_id || item.id);
                            }}
                          >
                            <MessageCircle className="w-3 h-3" />
                            {item.comments_count || 0}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center gap-1 text-xs text-gray-500"
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onClick={async (e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              console.log('🔍 UnifiedFeed: Review share clicked', { itemId: item.id, reviewId: item.review_id || item.id });
                              try {
                                const reviewId = item.review_id || item.id;
                                const url = await ShareService.shareReview(reviewId, item.title, item.content || undefined);
                                toast({ 
                                  title: 'Review Shared!', 
                                  description: 'Link copied to clipboard',
                                  duration: 2000
                                });
                                
                                // Optimistically increment share count
                                setFeedItems(prev => prev.map(x => 
                                  x.id === item.id 
                                    ? { ...x, shares_count: (x.shares_count || 0) + 1 } 
                                    : x
                                ));
                                
                                // Record the share in the database
                                try {
                                  await ReviewService.shareReview(currentUserId || '', reviewId);
                                } catch (shareError) {
                                  console.error('❌ UnifiedFeed: Error recording share:', shareError);
                                  // Revert optimistic update on error
                                  setFeedItems(prev => prev.map(x => 
                                    x.id === item.id 
                                      ? { ...x, shares_count: (x.shares_count || 0) - 1 } 
                                      : x
                                  ));
                                }
                              } catch (error) {
                                console.error('❌ UnifiedFeed: Error sharing review:', error);
                                toast({
                                  title: "Error",
                                  description: "Failed to share review",
                                  variant: "destructive",
                                });
                              }
                            }}
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
              
              {/* Empty state for reviews */}
              {sortedFeedItems.filter(item => item.type === 'review').length === 0 && !loading && (
                <EmptyState
                  icon={<Star className="w-16 h-16" />}
                  title="No Reviews Yet"
                  description="Start writing reviews about concerts you've attended to help others discover great shows!"
                  action={{
                    label: "Write First Review",
                    onClick: () => setShowReviewModal(true)
                  }}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
          
          {/* Loading more indicator */}
          {loadingMore && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-synth-pink mx-auto mb-3"></div>
              <p className="text-sm text-gray-600 font-medium">Loading more...</p>
            </div>
          )}
          
          {/* End of feed indicator */}
          {!hasMore && sortedFeedItems.length > 0 && (
            <div className="text-center py-12">
              <div className="w-20 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mx-auto mb-4"></div>
              <p className="text-sm text-gray-500 font-medium">You're all caught up!</p>
              <p className="text-xs text-gray-400 mt-2">Check back later for new content</p>
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
        onReview={() => {
          if (selectedEventForDetails) {
            setSelectedReviewEvent(selectedEventForDetails);
            setShowReviewModal(true);
          }
        }}
        onInterestToggle={async (eventId, interested) => {
          try {
            await UserEventService.setEventInterest(currentUserId, eventId, interested);
            setSelectedEventInterested(interested);
            
            // Update the feed items locally without reloading
            setFeedItems(prevItems => 
              prevItems.map(item => {
                if (item.type === 'event' && item.event_data?.id === eventId) {
                  return {
                    ...item,
                    event_data: {
                      ...item.event_data,
                      isInterested: interested
                    }
                  };
                }
                return item;
              })
            );
            
            toast({
              title: interested ? "Event Added!" : "Event Removed",
              description: interested 
                ? "You're now interested in this event" 
                : "You're no longer interested in this event",
            });
          } catch (e) {
            console.error('Failed to toggle interest from feed modal', e);
            toast({
              title: "Error",
              description: "Failed to update your interest. Please try again.",
              variant: "destructive",
            });
          }
        }}
        onAttendanceChange={(eventId, attended) => {
          console.log('🎯 Attendance changed in feed:', eventId, attended);
          // Update the feed to mark event as attended
          if (attended) {
            setFeedItems(prevItems => 
              prevItems.map(item => {
                if (item.type === 'event' && item.event_data?.id === eventId) {
                  return {
                    ...item,
                    event_data: {
                      ...item.event_data,
                      isInterested: false, // Remove from interested when attended
                      hasAttended: true
                    }
                  };
                }
                return item;
              })
            );
          }
        }}
        isInterested={selectedEventInterested}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToChat={onNavigateToChat}
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

      {/* Inline Review Comments Modal from feed */}
      <ReviewCommentsModal
        reviewId={openReviewCommentsFor}
        isOpen={Boolean(openReviewCommentsFor)}
        onClose={() => setOpenReviewCommentsFor(null)}
        currentUserId={currentUserId}
        onCommentAdded={() => {
          // Optimistically bump count for the currently open review card
          if (!openReviewCommentsFor) return;
          setFeedItems(prev => prev.map(item => {
            if (item.type === 'review' && (item.review_id || item.id) === openReviewCommentsFor) {
              return { ...item, comments_count: (item.comments_count || 0) + 1 };
            }
            return item;
          }));
        }}
        onCommentsLoaded={(count) => {
          // Sync count from server load in case it differs
          if (!openReviewCommentsFor) return;
          setFeedItems(prev => prev.map(item => {
            if (item.type === 'review' && (item.review_id || item.id) === openReviewCommentsFor) {
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

      {/* Review View Dialog - mirrors ProfileView */}
      <Dialog open={viewReviewOpen} onOpenChange={(open) => {
        setViewReviewOpen(open);
        if (!open) {
          setShowCommentsInModal(false);
        }
      }}>
        <DialogContent className="max-w-2xl w-[95vw] h-[85dvh] max-h-[85dvh] md:max-h-[80vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
            <DialogTitle>Review</DialogTitle>
          </DialogHeader>
          {selectedReviewForView && (
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              <ProfileReviewCard
                title={selectedReviewForView.event_info?.event_name || selectedReviewForView.title}
                rating={selectedReviewForView.rating || 0}
                reviewText={selectedReviewForView.content || ''}
                event={{
                  event_name: selectedReviewForView.event_info?.event_name || selectedReviewForView.title || 'Concert Review',
                  event_date: selectedReviewForView.event_info?.event_date || selectedReviewForView.created_at,
                  artist_name: selectedReviewForView.event_info?.artist_name || null,
                  artist_id: null,
                  venue_name: selectedReviewForView.event_info?.venue_name || null,
                  venue_id: selectedReviewForView.event_info?.venue_id || null,
                }}
                reviewId={String(selectedReviewForView.review_id || selectedReviewForView.id).replace(/^public-review-/, '')}
                currentUserId={currentUserId}
                initialIsLiked={Boolean(selectedReviewForView.is_liked)}
                initialLikesCount={selectedReviewForView.likes_count || 0}
                initialCommentsCount={selectedReviewForView.comments_count || 0}
                initialSharesCount={selectedReviewForView.shares_count || 0}
                showCommentsInitially={showCommentsInModal}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* In-App Event Share Modal */}
      {selectedEventForShare && currentUserId && (
        <EventShareModal
          event={selectedEventForShare}
          currentUserId={currentUserId}
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSelectedEventForShare(null);
          }}
        />
      )}
      </div>
    </div>
  );
};
