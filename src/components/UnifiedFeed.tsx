"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PromotedEventBadge } from '@/components/events/PromotedEventBadge';
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
  ArrowDown,
  Newspaper,
  Flag,
  Bookmark,
  MoreHorizontal,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  X
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
import { BelliStyleReviewCard } from '@/components/reviews/BelliStyleReviewCard';
import { ProfileReviewCard } from '@/components/reviews/ProfileReviewCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventCommentsModal } from '@/components/events/EventCommentsModal';
import { ReviewCommentsModal } from '@/components/reviews/ReviewCommentsModal';
import { EventLikersModal } from '@/components/events/EventLikersModal';
import { EventLikesService } from '@/services/eventLikesService';
import { EventShareModal } from '@/components/events/EventShareModal';
import { ShareService } from '@/services/shareService';
import { trackInteraction } from '@/services/interactionTrackingService';
import { FriendActivityFeed } from '@/components/social/FriendActivityFeed';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { extractEventMetadata } from '@/utils/trackingHelpers';
import { useIntersectionTrackingList } from '@/hooks/useIntersectionTracking';
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
import { extractNumericPrice, formatPrice } from '@/utils/currencyUtils';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { ArtistFollowService } from '@/services/artistFollowService';
import { VenueFollowService } from '@/services/venueFollowService';
import { NewsService } from '@/services/newsService';
import { NewsCard, NewsCardSkeleton } from '@/components/news/NewsCard';
import { NewsArticle } from '@/types/news';
import { ArtistCard } from '@/components/ArtistCard';
import { VenueCard } from '@/components/reviews/VenueCard';
import { FollowIndicator } from '@/components/events/FollowIndicator';
import type { Artist } from '@/types/concertSearch';

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
  // Debug: Check if navigation handlers and userId are provided (only log once)
  const hasLogged = useRef(false);
  if (!hasLogged.current && currentUserId) {
    console.log('🔍 UnifiedFeed initialized:', {
      currentUserId,
      hasCurrentUserId: !!currentUserId,
    onNavigateToProfile: !!onNavigateToProfile,
    onNavigateToChat: !!onNavigateToChat
  });
    hasLogged.current = true;
  }
  
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
  const [openReportFor, setOpenReportFor] = useState<string | null>(null);
  const [reportContentType, setReportContentType] = useState<'event' | 'review'>('review');
  const [viewReviewOpen, setViewReviewOpen] = useState(false);
  const [selectedReviewForView, setSelectedReviewForView] = useState<any>(null);
  const [showCommentsInModal, setShowCommentsInModal] = useState(false);
  const [showReviewDetailModal, setShowReviewDetailModal] = useState(false);
  const [selectedReviewDetail, setSelectedReviewDetail] = useState<UnifiedFeedItem | null>(null);
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'price' | 'popularity' | 'distance'>('relevance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterByFollowing, setFilterByFollowing] = useState<'all' | 'following'>('all');

  // Instagram-style media state
  const [currentMediaIndex, setCurrentMediaIndex] = useState<{ [key: string]: number }>({});
  const [playingVideos, setPlayingVideos] = useState<{ [key: string]: boolean }>({});
  const [videoVolumes, setVideoVolumes] = useState<{ [key: string]: number }>({});
  const [showFullscreenMedia, setShowFullscreenMedia] = useState<{ [key: string]: boolean }>({});
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  
  // Following state
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [followedVenues, setFollowedVenues] = useState<Array<{name: string, city?: string, state?: string}>>([]);
  const [loadingFollows, setLoadingFollows] = useState(false);
  
  // In-app sharing state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedEventForShare, setSelectedEventForShare] = useState<any>(null);
  
  // News state
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSource, setNewsSource] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('events');
  
  // Artist and Venue dialog state
  const [artistDialog, setArtistDialog] = useState<{ open: boolean; artist: Artist | null }>({ open: false, artist: null });
  const [venueDialog, setVenueDialog] = useState<{ open: boolean; venueId: string | null; venueName: string }>({ open: false, venueId: null, venueName: '' });

  // Fetch news function - now with personalization
  const fetchNews = async () => {
    setNewsLoading(true);
    try {
      // Use personalized news fetch based on user's music preferences
      const articles = await NewsService.getPersonalizedNews(currentUserId);
      setNewsArticles(articles);
      
      const personalizedCount = articles.filter(a => (a.relevance_score || 0) > 0).length;
      
      toast({
        title: 'News updated',
        description: personalizedCount > 0 
          ? `Loaded ${articles.length} articles (${personalizedCount} personalized for you)`
          : `Loaded ${articles.length} articles`
      });
    } catch (error) {
      console.error('Error fetching news:', error);
      toast({
        title: 'Error',
        description: 'Failed to load news articles',
        variant: 'destructive'
      });
    } finally {
      setNewsLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'news') {
      // Always fetch fresh personalized results when clicking News tab
      NewsService.clearCache(); // Clear cache for fresh results
      fetchNews();
    }
  };

  useEffect(() => {
    if (sessionExpired) {
      setLoading(false);
      return;
    }
    
    if (!currentUserId) {
      return;
    }
    
    // Debounce location service to prevent excessive calls
    const locationTimeout = setTimeout(() => {
      console.log('🔍 Starting location service...');
      
      // Add a timeout to prevent hanging
      const locationPromise = LocationService.getCurrentLocation();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Location service timeout')), 3000) // Reduced timeout
      );
      
      Promise.race([locationPromise, timeoutPromise])
      .then(location => {
          console.log('🔍 Location service succeeded:', location);
          setUserLocation({ lat: (location as any).latitude, lng: (location as any).longitude });
          setMapCenter([(location as any).latitude, (location as any).longitude]);
        setMapZoom(10);
      })
      .catch(error => {
          console.log('🔍 Location service failed or timed out:', error);
        // Continue without location
      })
      .finally(() => {
          console.log('🔍 Location service finally block - loading feed data...');
        loadFeedData();
        loadUpcomingEvents();
          loadFollowedData();
        });
    }, 500); // Debounce by 500ms
    
    return () => clearTimeout(locationTimeout);
  }, [sessionExpired, currentUserId]); // Add currentUserId back with proper dependency management

  // Add event listeners for artist and venue card opening
  useEffect(() => {
    const openVenue = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setVenueDialog({ 
        open: true, 
        venueId: detail.venueId || null, 
        venueName: detail.venueName || 'Venue' 
      });
    };

    const openArtist = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.artistName) {
        try {
          // Try to fetch artist data from database if we have an ID
          if (detail.artistId && detail.artistId !== 'manual') {
            const { data: artistData } = await supabase
              .from('artists')
              .select('*')
              .eq('id', detail.artistId)
              .single();
            
            if (artistData) {
              const artist: Artist = {
                id: artistData.id,
                name: artistData.name,
                image_url: artistData.image_url,
                popularity_score: 0,
                source: 'database',
                events: []
              } as any;
              setArtistDialog({ open: true, artist });
              return;
            }
          }
        } catch (error) {
          console.error('Error fetching artist:', error);
        }
        
        // Fallback: open with name only
        const artist: Artist = { 
          id: detail.artistId || 'manual', 
          name: detail.artistName || 'Unknown Artist' 
        } as any;
        setArtistDialog({ open: true, artist });
      }
    };

    document.addEventListener('open-venue-card', openVenue as EventListener);
    document.addEventListener('open-artist-card', openArtist as EventListener);
    
    return () => {
      document.removeEventListener('open-venue-card', openVenue as EventListener);
      document.removeEventListener('open-artist-card', openArtist as EventListener);
    };
  }, []);

  // Load followed artists and venues for filtering
  const loadFollowedData = async () => {
    if (!currentUserId) return;
    
    setLoadingFollows(true);
    try {
      // Load followed artists
      const artists = await ArtistFollowService.getUserFollowedArtists(currentUserId);
      setFollowedArtists(artists.map(artist => artist.artist_name));

      // Load followed venues
      const venues = await VenueFollowService.getUserFollowedVenues(currentUserId);
      setFollowedVenues(venues.map(venue => ({
        name: venue.venue_name,
        city: venue.venue_city,
        state: venue.venue_state
      })));
    } catch (error) {
      console.error('Error loading followed data:', error);
    } finally {
      setLoadingFollows(false);
    }
  };

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

  // Handle events from localStorage (from chat navigation)
  useEffect(() => {
    const checkForSelectedEvent = () => {
      const selectedEventData = localStorage.getItem('selectedEvent');
      if (selectedEventData) {
        try {
          const eventData = JSON.parse(selectedEventData);
          console.log('✅ UnifiedFeed: Opening event from localStorage:', eventData);
          setSelectedEventForDetails(eventData);
          setDetailsOpen(true);
          
          // Clear localStorage so we don't re-open it again
          localStorage.removeItem('selectedEvent');
        } catch (error) {
          console.error('Error parsing selectedEvent from localStorage:', error);
          localStorage.removeItem('selectedEvent');
        }
      }
    };

    checkForSelectedEvent();
  }, []);

  // Instagram-style helper functions
  const nextMedia = (itemId: string, mediaArray: any[]) => {
    setCurrentMediaIndex(prev => ({
      ...prev,
      [itemId]: Math.min((prev[itemId] || 0) + 1, mediaArray.length - 1)
    }));
  };

  const prevMedia = (itemId: string) => {
    setCurrentMediaIndex(prev => ({
      ...prev,
      [itemId]: Math.max((prev[itemId] || 0) - 1, 0)
    }));
  };

  const toggleVideoPlay = (itemId: string) => {
    setPlayingVideos(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const toggleVideoVolume = (itemId: string) => {
    setVideoVolumes(prev => ({
      ...prev,
      [itemId]: prev[itemId] === 1 ? 0 : 1
    }));
  };

  const toggleFullscreen = (itemId: string) => {
    setShowFullscreenMedia(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleInstagramLike = async (item: UnifiedFeedItem) => {
    if (!currentUserId) return;
    
    const isLiked = likedPosts.has(item.id);
    const newLikedPosts = new Set(likedPosts);
    
    if (isLiked) {
      newLikedPosts.delete(item.id);
    } else {
      newLikedPosts.add(item.id);
    }
    
    setLikedPosts(newLikedPosts);
    
    // Track interaction
    try {
      await trackInteraction.like(item.type, item.review_id || item.id, !!currentUserId);
    } catch (error) {
      console.error('Error tracking like:', error);
    }
  };

  const handleBookmark = async (item: UnifiedFeedItem) => {
    const isBookmarked = bookmarkedPosts.has(item.id);
    const newBookmarkedPosts = new Set(bookmarkedPosts);
    
    if (isBookmarked) {
      newBookmarkedPosts.delete(item.id);
    } else {
      newBookmarkedPosts.add(item.id);
    }
    
    setBookmarkedPosts(newBookmarkedPosts);
  };


  const handleReviewClick = (item: UnifiedFeedItem) => {
    if (item.type === 'review') {
      // Don't open modal for deleted reviews
      if ((item as any).deleted_at || (item as any).is_deleted) {
        return;
      }
      setSelectedReviewDetail(item);
      setShowReviewDetailModal(true);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = parseISO(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return `${Math.floor(diffInSeconds / 86400)}d`;
  };

  const renderInstagramMedia = (item: UnifiedFeedItem) => {
    const photos = item.photos || [];
    const currentIndex = currentMediaIndex[item.id] || 0;
    const currentMedia = photos[currentIndex];

    if (!currentMedia || !photos.length) return null;

    // Since currentMedia may be a string URL or an object, handle both cases
    let isVideo = false;
    const mediaItem = currentMedia as any; // Type assertion since we've already checked for null
    if (typeof mediaItem === 'object' && 'type' in mediaItem) {
      isVideo = mediaItem.type?.includes('video');
    } else if (typeof mediaItem === 'string') {
      isVideo = mediaItem.includes('.mp4') || mediaItem.includes('.mov');
    }

    const isPlaying = playingVideos[item.id] || false;
    const volume = videoVolumes[item.id] !== undefined ? videoVolumes[item.id] : 1;
    const isFullscreen = showFullscreenMedia[item.id] || false;

    return (
      <div className={`relative bg-black ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
        {/* Media - Ultra compact with height limit */}
        <div className="relative w-full aspect-[21/9] max-h-48 bg-black flex items-center justify-center">
          {isVideo ? (
            <video
              className="w-full h-full object-cover"
              controls={false}
              autoPlay={isPlaying}
              muted={volume === 0}
              loop
              onClick={() => toggleVideoPlay(item.id)}
            >
              <source src={currentMedia} type="video/mp4" />
            </video>
          ) : (
            <img
              src={currentMedia}
              alt="Post media"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => toggleFullscreen(item.id)}
            />
          )}

          {/* Video controls overlay */}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => toggleVideoPlay(item.id)}
                className="bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
            </div>
          )}

          {/* Volume control for videos */}
          {isVideo && (
            <button
              onClick={() => toggleVideoVolume(item.id)}
              className="absolute top-3 right-3 bg-black/50 rounded-full p-1.5 text-white hover:bg-black/70 transition-colors"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}

          {/* Fullscreen control */}
          <button
            onClick={() => toggleFullscreen(item.id)}
            className="absolute top-3 left-3 bg-black/50 rounded-full p-1.5 text-white hover:bg-black/70 transition-colors"
          >
            {isFullscreen ? <X className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
          </button>

          {/* Media navigation arrows */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => prevMedia(item.id)}
                disabled={currentIndex === 0}
                className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 rounded-full p-1.5 text-white hover:bg-black/70 transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => nextMedia(item.id, photos)}
                disabled={currentIndex === photos.length - 1}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 rounded-full p-1.5 text-white hover:bg-black/70 transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Media indicators */}
          {photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-1">
              {photos.map((_, index) => (
                <div
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full ${
                    index === currentIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

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
      console.log('🔄 loadFeedData called with offset:', offset);
      
      if (offset === 0) {
        setLoading(true);
        setFeedItems([]); // Clear existing items for fresh load
        setHasMore(true); // Reset hasMore state
      } else {
        setLoadingMore(true);
      }

      // Add minimum loading time for better UX demonstration
      const minLoadingTime = offset === 0 ? new Promise(resolve => setTimeout(resolve, 800)) : Promise.resolve();

      const [rawItems] = await Promise.all([
        UnifiedFeedService.getFeedItems({
          userId: currentUserId,
          limit: 20,
          offset,
          includePrivateReviews: true
        }),
        minLoadingTime
      ]);

        // Filter out deleted reviews and reviews without content
        const items = rawItems.filter(item => {
          // Filter out deleted reviews
          if (item.type === 'review') {
            // Check if review is marked as deleted
            if ((item as any).deleted_at || (item as any).is_deleted) {
              return false;
            }
            // Check if review has no content and no media
            if (!item.content && (!item.photos || item.photos.length === 0)) {
              return false;
            }
            // Check for specific content that might indicate a deleted review
            if (item.content === 'ATTENDANCE_ONLY' || item.content === '[deleted]' || item.content === 'DELETED') {
              return false;
            }
          }
          return true;
        });

      if (offset === 0) {
        setFeedItems(items);
      } else {
        setFeedItems(prev => [...prev, ...items]);
      }

      // console.log('📊 Feed loading debug:', {
      //   offset,
      //   itemsReturned: items.length,
      //   hasMore: items.length === 20,
      //   totalItemsAfter: offset === 0 ? items.length : items.length + offset
      // });

      const newHasMore = items.length === 20;
      // console.log('🎯 Setting hasMore to:', newHasMore);
      setHasMore(newHasMore); // If we got fewer than requested, no more items
      
    } catch (error) {
      console.error('Error loading feed data:', error);
      toast({
        title: "Error",
        description: "Failed to load feed data",
        variant: "destructive",
      });
    } finally {
      console.log('🔄 Setting loading to false');
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
      // Track share click for events
      if (item.type === 'event' && item.event_data) {
        try {
          // Track interaction
          await trackInteraction.click('share', item.event_data.id, {
            source: 'feed_event_card',
            artist_name: item.event_data.artist_name,
            venue_name: item.event_data.venue_name
          });
        } catch (trackError) {
          console.error('Error tracking share:', trackError);
        }
      }
      
      // For events, open EventShareModal
      if (item.type === 'event' && item.event_data) {
        setSelectedEventForShare(item.event_data);
        setShareModalOpen(true);
      } else {
        // For non-events, just copy to clipboard
      const shareText = `Check out this ${item.type}: ${item.title}`;
      await navigator.clipboard.writeText(shareText);
      
      toast({
        title: "Shared!",
        description: "Link copied to clipboard",
      });
      }
    } catch (error) {
      console.error('Error sharing item:', error);
    }
  };

  const handleEventInterest = async (item: UnifiedFeedItem) => {
    if (!currentUserId || !item.event_data) return;
    
    // Open the event details modal
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
    
    // Also toggle interest immediately
    try {
      const isCurrentlyInterested = interestedEvents.has(item.event_data.id);
      await UserEventService.setEventInterest(currentUserId, item.event_data.id, !isCurrentlyInterested);
      
      // Update local state  
      if (!isCurrentlyInterested) {
        setInterestedEvents(prev => new Set([...prev, item.event_data.id]));
      } else {
        setInterestedEvents(prev => {
          const next = new Set(prev);
          next.delete(item.event_data.id);
          return next;
        });
      }
      
      setSelectedEventInterested(!isCurrentlyInterested);
      
      toast({
        title: !isCurrentlyInterested ? "Marked as interested!" : "Removed interest",
        description: !isCurrentlyInterested 
          ? "You're interested in this event" 
          : "Removed from your interested list"
      });
    } catch (error) {
      console.error('Error toggling interest:', error);
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

  // Filter feed items by following status
  const filterFeedItems = (items: UnifiedFeedItem[]) => {
    if (filterByFollowing === 'all') {
      return items;
    }

    return items.filter(item => {
      // For event items
      if (item.type === 'event' && item.event_data) {
        const event = item.event_data;
        
        // Check if artist is followed
        if (event.artist_name && followedArtists.includes(event.artist_name)) {
          return true;
        }
        
        // Check if venue is followed
        if (event.venue_name) {
          return followedVenues.some(venue => 
            venue.name === event.venue_name &&
            (!venue.city || venue.city === event.venue_city) &&
            (!venue.state || venue.state === event.venue_state)
          );
        }
      }
      
      // For review items
      if (item.type === 'review' && item.event_info) {
        const eventInfo = item.event_info;
        
        // Check if artist is followed
        if (eventInfo.artist_name && followedArtists.includes(eventInfo.artist_name)) {
          return true;
        }
        
        // Check if venue is followed
        if (eventInfo.venue_name) {
          return followedVenues.some(venue => 
            venue.name === eventInfo.venue_name
            // Note: event_info doesn't have city/state, so we match by name only
          );
        }
      }
      
      return false;
    });
  };

  // Get filtered and sorted feed items
  const processedFeedItems = useMemo(() => {
    const filtered = filterFeedItems(feedItems);
    return sortFeedItems(filtered);
  }, [feedItems, filterByFollowing, followedArtists, followedVenues, sortBy, sortOrder]);

  // 🎯 TRACKING: Event impression tracking with IntersectionObserver
  const eventItems = useMemo(() => 
    processedFeedItems
      .filter(item => item.type === 'event')
      .map((item, index) => ({
        id: item.event_data?.id || item.id,
        metadata: {
          source: 'feed',
          position: index,
          feed_tab: activeTab,
          feed_type: filterByFollowing,
          artist_name: item.event_data?.artist_name || item.event_info?.artist_name,
          venue_name: item.event_data?.venue_name || item.event_info?.venue_name,
          distance_miles: item.distance_miles,
          relevance_score: item.relevance_score
        }
      })),
    [processedFeedItems, activeTab, filterByFollowing]
  );

  const attachEventObserver = useIntersectionTrackingList('event', eventItems, {
    threshold: 0.5,
    trackOnce: true,
    debounce: 500
  });

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

  console.log('🔍 UnifiedFeed render - loading:', loading, 'feedItems.length:', feedItems.length);

  if (loading) {
    console.log('🔍 Showing skeleton loading state');
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feed</h1>
            <p className="text-gray-600 mt-2">Discover reviews and events from friends and the community</p>
        </div>
        
          {/* Right side icons */}
          <div className="flex items-center gap-3">
            {/* Notifications button */}
            <Button
              variant="outline"
              size="sm"
              className="relative p-2"
              onClick={onNavigateToNotifications}
            >
              <Bell className="w-5 h-5" />
            </Button>
            
            {/* Chat button */}
            <Button
              variant="outline"
              size="sm"
              className="p-2"
              onClick={() => onNavigateToChat?.(currentUserId)}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Feed type tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-white/60 backdrop-blur-sm border border-white/20 rounded-2xl p-1">
            <TabsTrigger value="events" className="flex items-center gap-2 data-[state=active]:bg-synth-pink data-[state=active]:text-white rounded-xl">
              <Calendar className="w-4 h-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2 data-[state=active]:bg-synth-pink data-[state=active]:text-white rounded-xl">
              <Star className="w-4 h-4" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="news" className="flex items-center gap-2 data-[state=active]:bg-synth-pink data-[state=active]:text-white rounded-xl">
              <Newspaper className="w-4 h-4" />
              News
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="events"
            className="space-y-4"
          >

            {/* Events Feed Items */}
        <div className="space-y-4">
              {processedFeedItems
                .filter(item => item.type === 'event')
                .map((item, index) => (
              <Card 
                key={`event-${item.id}-${index}`} 
                className={cn(
                  "cursor-pointer overflow-hidden group",
                  // Gold glow for promoted events
                  item.event_data?.is_promoted && "ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-200/30 border-yellow-200/50"
                )}
                ref={(el) => el && attachEventObserver(el, item.event_data?.id || item.id)}
                data-tour={index === 0 ? "event-card" : undefined}
                onClick={async (e) => {
                  if (e.defaultPrevented) return;
                  if (item.event_data) {
                    // 🎯 TRACK: Promotion interaction for event card click
                    const { PromotionTrackingService } = await import('@/services/promotionTrackingService');
                    PromotionTrackingService.trackPromotionInteraction(
                      item.event_data.id,
                      currentUserId,
                      'click',
                      {
                        source: 'feed_event_card_click',
                        artist_name: item.event_data.artist_name,
                        venue_name: item.event_data.venue_name
                      }
                    );
                    
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
                  {/* Only show author info for non-event items */}
                  {item.type !== 'event' && (
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
                          {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  )}

                  {/* Event Hero Image */}
                  <div className="mb-4">
                    <ReviewHeroImage item={item} />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="font-bold text-lg text-gray-900">
                          {item.title}
                        </h2>
                        <div className="flex items-center gap-2">
                          {/* Follow Indicator Chip */}
                          <FollowIndicator
                            followedArtists={followedArtists}
                            followedVenues={followedVenues}
                            artistName={item.event_data?.artist_name}
                            venueName={item.event_data?.venue_name}
                            venueCity={item.event_data?.venue_city}
                            venueState={item.event_data?.venue_state}
                          />
                        {/* Promoted Event Badge */}
                        {item.event_data?.is_promoted && item.event_data?.promotion_tier && (
                          <PromotedEventBadge promotionTier={item.event_data.promotion_tier as 'basic' | 'premium' | 'featured'} />
                        )}
                        </div>
                      </div>
                      {item.event_data && (
                        <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-synth-pink" />
                            <span>{item.event_data.venue_name}</span>
                        </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-synth-pink" />
                            <span>{format(parseISO(item.event_data.event_date), 'EEEE, MMMM d, yyyy')}</span>
                          </div>
                          {item.event_data.price_range && (
                            <div className="flex items-center gap-2">
                              <span className="text-synth-pink">💰</span>
                              <span>{formatPrice(item.event_data.price_range)}</span>
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        {item.type === 'event' && item.event_data ? (
                          <button
                            onClick={(e) => {
                          e.stopPropagation(); 
                              handleEventInterest(item);
                            }}
                            className={`flex items-center gap-1 text-sm transition-colors px-3 py-1 rounded-md ${
                              interestedEvents.has(item.event_data.id) 
                                ? 'bg-pink-500 text-white hover:bg-pink-600' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${interestedEvents.has(item.event_data.id) ? 'fill-current' : ''}`} />
                            <span>{interestedEvents.has(item.event_data.id) ? 'Interested' : "I'm Interested"}</span>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInstagramLike(item);
                            }}
                            className={`flex items-center gap-1 text-sm transition-colors ${
                              likedPosts.has(item.id) ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${likedPosts.has(item.id) ? 'fill-current' : ''}`} />
                            <span>{item.likes_count || 0}</span>
                          </button>
                        )}
                      <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenEventCommentsFor(item.event_data?.id || item.id);
                          }}
                          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{item.comments_count || 0}</span>
                      </button>
                        <button
                          onClick={(e) => {
                          e.stopPropagation(); 
                            handleShare(item);
                          }}
                          className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-500 transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                          <span>Share</span>
                        </button>
                    </div>
                      <div className="text-xs text-gray-400">
                        {formatTimeAgo(item.created_at)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            {/* Reviews feed */}
            {feedItems.filter(item => item.type === 'review' && !(item as any).deleted_at && !(item as any).is_deleted).length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Star className="w-8 h-8 text-gray-400" />
                    </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No reviews yet</h3>
                  <p className="text-gray-500">Be the first to share a concert review!</p>
                    </div>
                  </div>
            ) : (
              <div className="space-y-6">
                {feedItems.filter(item => item.type === 'review' && !(item as any).deleted_at && !(item as any).is_deleted).map((item, index) => {
                  console.log('🖼️ Review item author data:', {
                    id: item.id,
                    authorName: item.author?.name,
                    avatarUrl: item.author?.avatar_url,
                    authorId: item.author?.id,
                    fullAuthor: item.author
                  });
                  return (
                  <BelliStyleReviewCard
                    key={`${item.id}-${index}`}
                    review={{
                      id: item.review_id || item.id,
                      user_id: item.author?.id || currentUserId,
                      event_id: (item as any).event_id || '',
                      rating: item.rating || 0,
                      review_text: item.content || '',
                      is_public: true,
                      created_at: item.created_at,
                      updated_at: item.created_at,
                      likes_count: item.likes_count || 0,
                      comments_count: item.comments_count || 0,
                      shares_count: 0,
                      is_liked_by_user: likedPosts.has(item.id),
                      reaction_emoji: '',
                      photos: item.photos || [],
                      videos: [],
                      mood_tags: [],
                      genre_tags: [],
                      context_tags: [],
                      artist_name: item.event_info?.artist_name,
                      venue_name: item.event_info?.venue_name,
                      performance_rating: (item as any).performance_rating,
                      venue_rating: (item as any).venue_rating,
                      overall_experience_rating: (item as any).overall_experience_rating,
                      performance_review_text: (item as any).performance_review_text,
                      venue_review_text: (item as any).venue_review_text,
                      overall_experience_review_text: (item as any).overall_experience_review_text,
                      setlist: (item as any).setlist,
                      custom_setlist: (item as any).custom_setlist
                    }}
                    currentUserId={currentUserId}
                    onLike={(reviewId, isLiked) => {
                      console.log('🔍 BelliStyle onLike:', { reviewId, isLiked, itemId: item.id });
                      if (isLiked) {
                        setLikedPosts(prev => new Set([...prev, item.id]));
                      } else {
                        setLikedPosts(prev => {
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        });
                      }
                    }}
                    onComment={() => setOpenReviewCommentsFor(item.review_id || item.id)}
                    onShare={() => handleShare(item)}
                    onEdit={() => {
                      console.log('Edit button clicked for review:', item.review_id || item.id);
                      console.log('Full item data:', item);
                      
                      // Fetch the full review data from the database
                      const fetchFullReviewData = async () => {
                        try {
                          // Get the event_id from the review
                          const { data: reviewData, error: reviewError } = await supabase
                            .from('user_reviews')
                            .select(`
                              *,
                              jambase_events!inner (
                                id,
                                title,
                                artist_name,
                                artist_id,
                                venue_name,
                                venue_id,
                                venue_city,
                                venue_state,
                                venue_zip,
                                venue_address,
                                event_date,
                                doors_time,
                                description,
                                genres,
                                price_range,
                                ticket_urls,
                                setlist
                              )
                            `)
                            .eq('id', item.review_id || item.id)
                            .single();
                          
                          if (reviewError) {
                            console.error('Error fetching review:', reviewError);
                            return;
                          }
                          
                          if (reviewData && reviewData.jambase_events) {
                            const event = reviewData.jambase_events;
                            const review = reviewData;
                            
                            console.log('🎵 Setting up edit modal with event data:', {
                              eventId: event.id,
                              artistName: event.artist_name,
                              venueName: event.venue_name,
                              hasSetlist: !!event.setlist,
                              reviewId: review.id
                            });
                            
                            // Create complete event object
                            setSelectedReviewEvent({
                              id: event.id,
                              jambase_event_id: (event as any).jambase_event_id,
                              title: event.title || 'Concert Review',
                              artist_name: event.artist_name,
                              artist_id: event.artist_id,
                              venue_name: event.venue_name,
                              venue_id: event.venue_id,
                              event_date: event.event_date,
                              doors_time: event.doors_time,
                              description: event.description,
                              genres: event.genres,
                              venue_city: event.venue_city,
                              venue_state: event.venue_state,
                              venue_zip: event.venue_zip,
                              venue_address: event.venue_address,
                              price_range: event.price_range,
                              ticket_urls: event.ticket_urls,
                              setlist: event.setlist, // This should show the setlist button
                              existing_review_id: review.id,
                              existing_review: {
                                rating: review.rating,
                                review_text: review.review_text,
                                performance_rating: review.performance_rating,
                                venue_rating: review.venue_rating,
                                overall_experience_rating: review.overall_experience_rating,
                                performance_review_text: review.performance_review_text,
                                venue_review_text: review.venue_review_text,
                                overall_experience_review_text: review.overall_experience_review_text,
                                reaction_emoji: review.reaction_emoji,
                                is_public: review.is_public,
                                review_type: review.review_type,
                                photos: review.photos,
                                custom_setlist: review.custom_setlist,
                                selectedSetlist: event.setlist, // Also set selectedSetlist so the button shows
                                venue_tags: review.venue_tags,
                                artist_tags: review.artist_tags,
                                mood_tags: review.mood_tags,
                                genre_tags: review.genre_tags,
                                context_tags: review.context_tags
                              }
                            });
                            setShowReviewModal(true);
                          }
                        } catch (error) {
                          console.error('Error loading review data for edit:', error);
                        }
                      };
                      
                      fetchFullReviewData();
                    }}
                    onDelete={async (reviewId) => {
                      try {
                        await ReviewService.deleteEventReview(currentUserId, reviewId);
                        loadFeedData(0); // Refresh feed
                                toast({ 
                          title: "Review Deleted",
                          description: "Your review has been deleted.",
                        });
                              } catch (error) {
                        console.error('Error deleting review:', error);
                                toast({
                                  title: "Error",
                          description: "Failed to delete review.",
                                  variant: "destructive",
                                });
                              }
                            }}
                    onReport={() => setOpenReportFor(item.id)}
                    userProfile={{
                      name: item.author?.name || 'User',
                      avatar_url: item.author?.avatar_url || undefined,
                      verified: (item.author as any)?.verified,
                      account_type: (item.author as any)?.account_type
                    }}
                    followedArtists={followedArtists}
                    followedVenues={followedVenues}
                  />
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="news"
            className="space-y-4"
          >
            {/* News Source Filter */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Music News</h2>
              <div className="flex items-center gap-2">
                <select
                  value={newsSource}
                  onChange={(e) => setNewsSource(e.target.value)}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="all">All Sources</option>
                  <option value="pitchfork">Pitchfork</option>
                  <option value="rollingstone">Rolling Stone</option>
                  <option value="nme">NME</option>
                  <option value="billboard">Billboard</option>
                </select>
                <Button
                  onClick={() => {
                    NewsService.clearCache();
                    fetchNews();
                  }}
                  variant="outline"
                  size="sm"
                  disabled={newsLoading}
                  className="text-pink-600 border-pink-200 hover:bg-pink-50"
                >
                  {newsLoading ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
                  ) : (
                    'Refresh'
                  )}
                          </Button>
                        </div>
                      </div>

            {/* News Loading State */}
            {newsLoading && newsArticles.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <NewsCardSkeleton key={index} />
                ))}
              </div>
            )}

            {/* News Articles */}
            {!newsLoading && newsArticles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {NewsService.filterBySource(newsArticles, newsSource).map((article) => (
                  <NewsCard key={article.id} article={article} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!newsLoading && newsArticles.length === 0 && (
                <EmptyState
                icon={<Newspaper className="w-12 h-12 text-gray-400" />}
                title="No news articles found"
                description="Check back later for the latest music news and updates!"
              />
            )}
          </TabsContent>
        </Tabs>
            </div>

      <div className="pb-20"></div>

      {/* Modals */}
      {showReviewModal && (
      <EventReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
          event={selectedReviewEvent}
          userId={currentUserId}
        onReviewSubmitted={() => {
          setShowReviewModal(false);
            loadFeedData();
        }}
      />
      )}

      {detailsOpen && selectedEventForDetails && (
      <EventDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
          event={selectedEventForDetails}
          currentUserId={currentUserId}
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
      )}

      {openEventCommentsFor && (
      <EventCommentsModal
        eventId={openEventCommentsFor}
        isOpen={Boolean(openEventCommentsFor)}
        onClose={() => setOpenEventCommentsFor(null)}
        />
      )}

      {openReviewCommentsFor && (
      <ReviewCommentsModal
        reviewId={openReviewCommentsFor}
        isOpen={Boolean(openReviewCommentsFor)}
        onClose={() => setOpenReviewCommentsFor(null)}
        />
      )}

      {openLikersFor && (
      <EventLikersModal
        eventId={openLikersFor}
        isOpen={Boolean(openLikersFor)}
        onClose={() => setOpenLikersFor(null)}
      />
      )}

      {shareModalOpen && selectedEventForShare && (
      <EventShareModal
        event={selectedEventForShare}
                currentUserId={currentUserId}
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
      )}

      {/* Report modal temporarily disabled due to prop mismatch */}

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

      {/* Review Detail Modal - Instagram-style layout */}
      {showReviewDetailModal && selectedReviewDetail && (
        <Dialog open={showReviewDetailModal} onOpenChange={setShowReviewDetailModal}>
          <DialogContent className="max-w-5xl w-[90vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex">
            {/* Left side - Image/Graphic */}
            <div className="flex-1 bg-black flex items-center justify-center min-h-0">
              {selectedReviewDetail.photos && selectedReviewDetail.photos.length > 0 ? (
                <img 
                  src={selectedReviewDetail.photos[0]} 
                  alt="Review photo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-white">
                  <div className="text-6xl font-bold mb-4">
                    <span className="text-pink-500">S</span>ynth
      </div>
                  <div className="w-32 h-0.5 bg-white mx-auto mb-4"></div>
                  <div className="text-sm opacity-80">Concert Review</div>
                </div>
              )}
            </div>
            
            {/* Right side - Content */}
            <div className="flex-1 flex flex-col bg-white">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {selectedReviewDetail.author?.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{selectedReviewDetail.author?.name || 'User'}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(selectedReviewDetail.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Event Info */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold mb-1">
                        {selectedReviewDetail.event_info?.event_name || 'Concert Review'}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {selectedReviewDetail.event_info?.artist_name} • {selectedReviewDetail.event_info?.event_date ? new Date(selectedReviewDetail.event_info.event_date).toLocaleDateString() : 'Date unknown'}
                      </p>
                      {selectedReviewDetail.event_info?.venue_name && (
                        <p className="text-sm text-gray-500">
                          {selectedReviewDetail.event_info.venue_name}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Event Status Badge */}
                  <div className="flex items-center gap-2">
                    {selectedReviewDetail.event_info?.event_date && new Date(selectedReviewDetail.event_info.event_date) < new Date() ? (
                      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700">
                        <Calendar className="w-3 h-3 mr-1" />
                        Past Event
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                        <Calendar className="w-3 h-3 mr-1" />
                        Upcoming
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Rating */}
                {selectedReviewDetail.rating && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={`w-5 h-5 ${
                            i < Math.floor(selectedReviewDetail.rating!) 
                              ? 'text-yellow-500 fill-yellow-500' 
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                      <span className="text-sm font-medium ml-1">{selectedReviewDetail.rating}/5</span>
                    </div>
                  </div>
                )}
                
                {/* Review Content */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Review</h3>
                  <p className="text-gray-700 leading-relaxed">
                    {selectedReviewDetail.content || 'No review text available.'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleInstagramLike(selectedReviewDetail)}
                    className={`flex items-center gap-2 transition-colors ${
                      likedPosts.has(selectedReviewDetail.id) ? 'text-red-500' : 'text-gray-700 hover:text-red-500'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${likedPosts.has(selectedReviewDetail.id) ? 'fill-current' : ''}`} />
                    <span>{selectedReviewDetail.likes_count || 0} likes</span>
                  </button>
                  <button
                    onClick={() => setOpenReviewCommentsFor(selectedReviewDetail.review_id || selectedReviewDetail.id)}
                    className="flex items-center gap-2 text-gray-700 hover:text-blue-500 transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>{selectedReviewDetail.comments_count || 0} comments</span>
                  </button>
                  <button
                    onClick={() => handleShare(selectedReviewDetail)}
                    className="flex items-center gap-2 text-gray-700 hover:text-green-500 transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                    <span>Share</span>
                  </button>
                  <button
                    onClick={() => handleBookmark(selectedReviewDetail)}
                    className={`flex items-center gap-2 transition-colors ${
                      bookmarkedPosts.has(selectedReviewDetail.id) ? 'text-yellow-500' : 'text-gray-700 hover:text-yellow-500'
                    }`}
                  >
                    <Bookmark className={`w-5 h-5 ${bookmarkedPosts.has(selectedReviewDetail.id) ? 'fill-current' : ''}`} />
                    <span>Save</span>
                  </button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Artist Dialog */}
      <Dialog open={artistDialog.open} onOpenChange={(open) => setArtistDialog({ open, artist: null })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {artistDialog.artist && (
            <ArtistCard
              artist={artistDialog.artist}
              events={[]}
              totalEvents={0}
              source="database"
              userId={currentUserId}
              onBack={() => setArtistDialog({ open: false, artist: null })}
              showAllEvents={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Venue Dialog */}
      <Dialog open={venueDialog.open} onOpenChange={(open) => setVenueDialog({ open, venueId: null, venueName: '' })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <VenueCard
            venueId={venueDialog.venueId}
            venueName={venueDialog.venueName}
            onClose={() => setVenueDialog({ open: false, venueId: null, venueName: '' })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
