"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  Map as MapIcon,
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
  X,
  RefreshCw,
  Loader2,
  Ticket
} from 'lucide-react';
import { CityService } from '@/services/cityService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { SynthSLogo } from '@/components/SynthSLogo';
import { PageActions } from '@/components/PageActions';
import { getEventStatus, isEventPast, getPastEvents, getUpcomingEvents } from '@/utils/eventStatusUtils';
import { ReviewService, PublicReviewWithProfile, ReviewWithEngagement } from '@/services/reviewService';
import { EventReviewModal } from '@/components/EventReviewModal';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { BelliStyleReviewCard } from '@/components/reviews/BelliStyleReviewCard';
import { ProfileReviewCard } from '@/components/reviews/ProfileReviewCard';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventCommentsModal } from '@/components/events/EventCommentsModal';
import { ReviewCommentsModal } from '@/components/reviews/ReviewCommentsModal';
import { EventLikersModal } from '@/components/events/EventLikersModal';
import { EventLikesService } from '@/services/eventLikesService';
import { EventShareModal } from '@/components/events/EventShareModal';
import { ReviewShareModal } from '@/components/reviews/ReviewShareModal';
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
import { EventMap } from '@/components/events/EventMap';
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
import { EventFilters, FilterState } from '@/components/search/EventFilters';
import { parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { normalizeCityName } from '@/utils/cityNormalization';
import { RadiusSearchService } from '@/services/radiusSearchService';
import { useNavigate } from 'react-router-dom';
import type { JamBaseEventResponse, JamBaseEvent } from '@/types/eventTypes';
import { UnifiedEventSearchService, type UnifiedEvent } from '@/services/unifiedEventSearchService';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_MAP_CENTER: [number, number] = [39.8283, -98.5795];

// Using UnifiedFeedItem from service instead of local interface

type FeedSectionKey = 'events' | 'reviews' | 'news';
const DEFAULT_FEED_SECTIONS: FeedSectionKey[] = ['events', 'reviews', 'news'];
const SECTION_META: Record<FeedSectionKey, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  events: { label: 'Events', icon: Calendar },
  reviews: { label: 'Reviews', icon: Star },
  news: { label: 'News', icon: Newspaper },
};

export interface FeedHeroHighlight {
  eventId: string;
  title: string;
  artistName?: string;
  venueName?: string;
  eventDate?: string;
  imageUrl?: string | null;
  distanceMiles?: number;
  eventData?: any;
}

interface UnifiedFeedProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  headerTitle?: string;
  headerSubtitle?: string;
  visibleSections?: FeedSectionKey[];
  enableMap?: boolean;
  sectionLayout?: 'tabs' | 'stacked';
  onHighlightUpdate?: (highlight: FeedHeroHighlight | null) => void;
  embedded?: boolean;
  showSectionTabs?: boolean;
}

export const UnifiedFeed = ({ 
  currentUserId, 
  onBack, 
  onNavigateToNotifications, 
  onViewChange,
  onNavigateToProfile,
  onNavigateToChat,
  headerTitle,
  headerSubtitle,
  visibleSections,
  enableMap,
  sectionLayout = 'tabs',
  onHighlightUpdate,
  embedded = false,
  showSectionTabs = true,
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
  
  const resolvedSections = useMemo<FeedSectionKey[]>(() => {
    if (!visibleSections || visibleSections.length === 0) {
      return DEFAULT_FEED_SECTIONS;
    }
    const filtered = visibleSections.filter((section): section is FeedSectionKey =>
      DEFAULT_FEED_SECTIONS.includes(section)
    );
    return filtered.length > 0 ? filtered : DEFAULT_FEED_SECTIONS;
  }, [visibleSections]);
  const sectionCount = resolvedSections.length;
  const isStacked = sectionLayout === 'stacked';
  const sectionGridClass =
    sectionCount === 1 ? 'grid-cols-1' :
    sectionCount === 2 ? 'grid-cols-2' :
    'grid-cols-3';
  const isEmbedded = embedded;
  const outerClassName = isEmbedded ? 'w-full' : 'min-h-screen bg-gray-50';
  const innerClassName = isEmbedded ? 'w-full space-y-0' : 'max-w-4xl mx-auto p-6 space-y-8';
  const headerSpacingClass = isEmbedded ? 'mb-0' : 'mb-8';
  const resolvedHeaderTitle = headerTitle ?? 'Feed';
  const resolvedHeaderSubtitle =
    headerSubtitle ?? 'Discover reviews and events from friends and the community';
  const normalizedHeaderTitle = resolvedHeaderTitle.trim();
  const normalizedHeaderSubtitle = resolvedHeaderSubtitle.trim();
  const shouldShowHeaderTitle = normalizedHeaderTitle.length > 0;
  const shouldShowHeaderSubtitle = normalizedHeaderSubtitle.length > 0;
  const shouldRenderHeader = shouldShowHeaderTitle || shouldShowHeaderSubtitle;
  const mapEnabled = enableMap ?? true;
  
  const [feedItems, setFeedItems] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewEvent, setSelectedReviewEvent] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [showUnifiedChat, setShowUnifiedChat] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [isMapDialogOpen, setIsMapDialogOpen] = useState(false);
  const { toast } = useToast();
  const { sessionExpired } = useAuth();
  const navigate = useNavigate();
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
  
  // Check localStorage for feed filter on mount
  const initialFollowingFilter = (() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('feedFilter');
      if (stored === 'following') {
        localStorage.removeItem('feedFilter'); // Clear after reading
        return 'following';
      }
    }
    return 'all';
  })();
  
  const [filterByFollowing, setFilterByFollowing] = useState<'all' | 'following'>(initialFollowingFilter);
  
  // Filter state (same as search area)
  const [filters, setFilters] = useState<FilterState>({
    genres: [],
    selectedCities: [],
    dateRange: { from: undefined, to: undefined },
    showFilters: false,
    radiusMiles: 30,
    filterByFollowing: initialFollowingFilter,
    daysOfWeek: []
  });
  
  // Temporary filter state - changes here don't trigger feed refresh
  const [pendingFilters, setPendingFilters] = useState<FilterState>(filters);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const autoCityAppliedRef = useRef<boolean>(false);
  const userHasChangedFiltersRef = useRef<boolean>(false); // Track if user manually changed filters
  const filterDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refresh state - track offset to get new events on refresh
  const [refreshOffset, setRefreshOffset] = useState(0);

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
  const [reviewShareModalOpen, setReviewShareModalOpen] = useState(false);
  const [selectedReviewForShare, setSelectedReviewForShare] = useState<any>(null);
  
  // News state
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSource, setNewsSource] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<FeedSectionKey>(() => resolvedSections[0] ?? 'events');

  useEffect(() => {
    if (isStacked) return;
    if (!resolvedSections.includes(activeTab)) {
      setActiveTab(resolvedSections[0] ?? 'events');
    }
  }, [resolvedSections, activeTab, isStacked]);
  
  // Artist and Venue dialog state
  const [artistDialog, setArtistDialog] = useState<{ open: boolean; artist: Artist | null; events?: JamBaseEvent[]; totalEvents?: number }>({ open: false, artist: null });
  const [venueDialog, setVenueDialog] = useState<{ open: boolean; venueId: string | null; venueName: string }>({ open: false, venueId: null, venueName: '' });
  const [artistDialogLoading, setArtistDialogLoading] = useState(false);

  // Fetch events when artist dialog opens
  useEffect(() => {
    const fetchArtistDialogEvents = async () => {
      if (!artistDialog.open || !artistDialog.artist) return;
      
      // If events are already loaded, skip
      if (artistDialog.events && artistDialog.events.length > 0) return;

      setArtistDialogLoading(true);
      try {
        const artistName = artistDialog.artist.name;

        // Fetch from database only
        const { data: dbEventsData, error } = await supabase
          .from('events')
          .select('*')
          .ilike('artist_name', `%${artistName}%`)
          .order('event_date', { ascending: true })
          .limit(200);

        if (error) {
          console.error('Error fetching events:', error);
          return;
        }

        const dbEvents: JamBaseEvent[] = (dbEventsData || []).map(event => ({
          ...event,
          source: 'manual'
        }));

        const allEvents = [...dbEvents];
        const deduplicatedEvents = deduplicateEvents(allEvents);
        deduplicatedEvents.sort((a, b) => 
          new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
        );

        setArtistDialog(prev => ({
          ...prev,
          events: deduplicatedEvents,
          totalEvents: deduplicatedEvents.length
        }));
      } catch (error) {
        console.error('Error fetching artist dialog events:', error);
      } finally {
        setArtistDialogLoading(false);
      }
    };

    fetchArtistDialogEvents();
  }, [artistDialog.open, artistDialog.artist?.name]);

  // Helper function to deduplicate events
  const deduplicateEvents = (events: JamBaseEvent[]): JamBaseEvent[] => {
    const seen = new Map<string, JamBaseEvent>();
    
    return events.filter(event => {
      const normalizeArtist = (event.artist_name || '').toLowerCase().trim();
      const normalizeVenue = (event.venue_name || '').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\bthe\s+/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      
      const dateKey = event.event_date?.split('T')[0] || '';
      const key = `${normalizeArtist}|${normalizeVenue}|${dateKey}`;
      
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        if (false) { // Removed Ticketmaster preference logic
          seen.set(key, event);
          return true;
        }
        return false;
      }
      
      seen.set(key, event);
      return true;
    });
  };

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
  const handleTabChange = (value: FeedSectionKey) => {
    setActiveTab(value);
    if (value === 'news' && resolvedSections.includes('news')) {
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
    
    // Load user's city from profile and auto-apply as filter (only once)
    const loadUserCityAndApply = async () => {
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('location_city')
          .eq('user_id', currentUserId)
          .maybeSingle();
        
        // Only auto-apply city if user hasn't manually changed filters
        if (profile?.location_city && !userHasChangedFiltersRef.current) {
          // Get the user's city and find the best match from available cities in the database
          const userCityRaw = profile.location_city.trim();
          console.log('📍 User location_city from profile:', userCityRaw);
          
          // Get available cities to find the best match
          let cityName = userCityRaw;
          try {
            const availableCities = await CityService.getAvailableCities(1, 1000);
            
            if (availableCities && availableCities.length > 0) {
              // Find best matching city using fuzzy matching
              const userCityLower = userCityRaw.toLowerCase().trim();
              
              // First try exact match
              let match = availableCities.find((c: any) => 
                c.city_name?.toLowerCase().trim() === userCityLower
              );
              
              // Then try contains match
              if (!match) {
                match = availableCities.find((c: any) => 
                  c.city_name?.toLowerCase().includes(userCityLower) || 
                  userCityLower.includes(c.city_name?.toLowerCase() || '')
                );
              }
              
              // Special handling for Washington DC variations
              if (!match && (userCityLower.includes('washington') || userCityLower.includes('dc') || userCityLower.includes('district'))) {
                match = availableCities.find((c: any) => {
                  const cityLower = c.city_name?.toLowerCase() || '';
                  return (cityLower.includes('washington') && (cityLower.includes('dc') || c.state === 'DC')) ||
                         (c.state === 'DC' && cityLower.includes('washington'));
                });
              }
              
              // Then try state code match (for DC, District of Columbia, etc.)
              if (!match && (userCityLower === 'dc' || userCityLower === 'district of columbia')) {
                match = availableCities.find((c: any) => 
                  c.state === 'DC' && c.city_name?.toLowerCase().includes('washington')
                );
              }
              
              if (match) {
                cityName = (typeof match === 'object' && match !== null && 'city_name' in match) 
                  ? match.city_name 
                  : (typeof match === 'string' ? match : userCityRaw);
                console.log('✅ Matched user city to database city:', userCityRaw, '→', cityName);
              } else {
                console.warn('⚠️ Could not match user city to available cities. Using raw city name:', userCityRaw);
                // Use raw city name - let the RPC handle variations
                cityName = userCityRaw;
              }
            }
          } catch (error) {
            console.warn('⚠️ Could not load available cities. Using raw city name:', error);
            cityName = userCityRaw;
          }
          
          console.log('✅ Auto-applying city filter from profile:', cityName);
          
          // Deduplicate cities to ensure we don't add duplicates
          const { deduplicateCities } = await import('@/utils/cityNormalization');
          const deduplicatedCities = deduplicateCities([cityName]);
          
          // Auto-apply city filter
          const newFilters: FilterState = {
            genres: [],
            selectedCities: deduplicatedCities,
            dateRange: { from: undefined, to: undefined },
            daysOfWeek: [],
            filterByFollowing: 'all',
            showFilters: false,
            radiusMiles: 50
          };
          setPendingFilters(newFilters);
          setFilters(newFilters);
          
          // Get city coordinates for location-based boosts
          if (cityName) {
            try {
              const { RadiusSearchService } = await import('@/services/radiusSearchService');
              const coords = await RadiusSearchService.getCityCoordinates(cityName);
              if (coords) {
                console.log('✅ Got city coordinates:', coords);
                setUserLocation(coords);
                setMapCenter([coords.lat, coords.lng]);
              }
            } catch (coordError) {
              console.warn('⚠️ Could not get city coordinates:', coordError);
            }
          }
          
          // Mark as applied so we don't do it again
          autoCityAppliedRef.current = true;
          
          // Load feed data DIRECTLY with the filters we just set
          // This ensures the city filter is applied immediately (no waiting for state to update)
          console.log('🔄 Initial load with auto-applied city filter:', cityName);
          
          setLoading(true);
          setFeedItems([]);
          setHasMore(true);
          
          try {
            const rawItems = await UnifiedFeedService.getFeedItems({
              userId: currentUserId,
              limit: 20,
              offset: 0,
              includePrivateReviews: true,
              filters: {
                genres: [],
                selectedCities: deduplicatedCities, // Already deduplicated above
                dateRange: undefined,
                daysOfWeek: [],
                filterByFollowing: undefined
              }
            });
            
            const items = rawItems.filter(item => {
              if (item.type === 'review') {
                if ((item as any).deleted_at || (item as any).is_deleted) return false;
                if (!item.content && (!item.photos || item.photos.length === 0)) return false;
                if (item.content === 'ATTENDANCE_ONLY' || item.content === '[deleted]' || item.content === 'DELETED') return false;
              }
              return true;
            });
            
            setFeedItems(items);
            const eventCount = items.filter(item => item.type === 'event').length;
            const gotFullPage = items.length >= 20 || eventCount >= 20;
            setHasMore(gotFullPage);
            setLoading(false);
            console.log('✅ Initial load complete:', items.length, 'items', eventCount, 'events');
          } catch (error) {
            console.error('Error in initial load:', error);
            setLoading(false);
          }
          
          // Load other data in parallel (non-blocking)
          Promise.all([
            loadUpcomingEvents(),
            loadFollowedData(),
            loadCities()
          ]).catch(err => console.warn('Error loading parallel data:', err));
          return; // Exit early
        }
      } catch (error) {
        console.warn('⚠️ Error loading user city from profile:', error);
      }
      
      // If no city found, load data normally - parallelize independent operations
      Promise.all([
        Promise.resolve(loadFeedData(0, false)),
        loadUpcomingEvents(),
        loadFollowedData(),
        loadCities()
      ]).catch(err => console.warn('Error loading parallel data:', err));
    };
    
    loadUserCityAndApply();
  }, [sessionExpired, currentUserId]);

  // Auto-apply nearest city to filters once when we have userLocation and no city filter yet
  useEffect(() => {
    const applyNearestCity = async () => {
      if (!userLocation) return;
      if (autoCityAppliedRef.current) return;
      if ((filters.selectedCities && filters.selectedCities.length > 0)) return;
      try {
        const data = await CityService.getAvailableCities(1, 200);
        if (!Array.isArray(data) || data.length === 0) return;
        // Compute nearest city center by simple haversine on frontend
        const toRad = (deg: number) => deg * (Math.PI / 180);
        const dist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 3959; // miles
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
          return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        let nearest = data[0];
        let nearestD = Infinity;
        for (const row of data as any[]) {
          const d = dist(userLocation.lat, userLocation.lng, Number(row.center_latitude), Number(row.center_longitude));
          if (d < nearestD) { nearestD = d; nearest = row; }
        }
        const nearestCityName = (nearest as any).city_name as string;
        if (nearestCityName) {
          autoCityAppliedRef.current = true;
          // Deduplicate cities to prevent duplicates
          const { deduplicateCities } = await import('@/utils/cityNormalization');
          const deduplicatedNearestCity = deduplicateCities([nearestCityName]);
          const next = { ...filters, selectedCities: deduplicatedNearestCity } as FilterState;
          setFilters(next);
          setPendingFilters(next);
          // Reload feed from top with city applied
          setRefreshOffset(0);
          loadFeedData(0, false);
        }
      } catch (e) {
        // Silent fail - location-based default is best-effort
      }
    };
    applyNearestCity();
  }, [userLocation, filters.selectedCities]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (filterDebounceTimeoutRef.current) {
        clearTimeout(filterDebounceTimeoutRef.current);
      }
    };
  }, []);

  // Add event listeners for artist and venue card opening
  useEffect(() => {
    const openVenue = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const venueId = detail.venueId || detail.venueName;
      
      // Navigate to full venue profile page
      if (venueId) {
        navigate(`/venue/${encodeURIComponent(venueId)}`);
      }
    };

    const openArtist = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.artistName) {
        // Use artistId if available, otherwise use artistName as fallback
        const artistId = detail.artistId && detail.artistId !== 'manual' 
          ? detail.artistId 
          : encodeURIComponent(detail.artistName);
        
        // Navigate to full artist profile page
        navigate(`/artist/${artistId}`);
      }
    };

    document.addEventListener('open-venue-card', openVenue as EventListener);
    document.addEventListener('open-artist-card', openArtist as EventListener);
    
    return () => {
      document.removeEventListener('open-venue-card', openVenue as EventListener);
      document.removeEventListener('open-artist-card', openArtist as EventListener);
    };
  }, [navigate]);

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

  // Load interested events when feedItems change
  useEffect(() => {
    if (!currentUserId || feedItems.length === 0) return;
    
    const eventItems = feedItems.filter(item => item.type === 'event' && item.event_data?.id);
    if (eventItems.length === 0) return;
    
    const eventIds = eventItems.map(item => item.event_data!.id).filter(Boolean) as string[];
    
    // Only load if we have events that aren't already in interestedEvents
    const uncheckedEventIds = eventIds.filter(id => !interestedEvents.has(id));
    if (uncheckedEventIds.length === 0) return;
    
    loadInterestedEventsForFeed(uncheckedEventIds);
  }, [feedItems, currentUserId, interestedEvents]);

  const handleMapEventClick = (mapEvent: JamBaseEventResponse) => {
    const matchingFeedItem = processedFeedItems.find(
      (item) => item.type === 'event' && item.event_data?.id === mapEvent.id
    );

    if (matchingFeedItem?.event_data) {
      setSelectedEventForDetails(matchingFeedItem.event_data);
    } else {
      setSelectedEventForDetails(mapEvent);
    }

    setDetailsOpen(true);
    setIsMapDialogOpen(false);
  };

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

  const loadFeedData = async (
    offset: number = 0,
    isRefresh: boolean = false,
    isFilterUpdate: boolean = false,
    overrideFilters?: FilterState
  ) => {
    try {
      const baseFilters = overrideFilters ?? filters;
      const activeFiltersState = isFilterUpdate ? (overrideFilters ?? pendingFilters) : baseFilters;

      // If refreshing, use refreshOffset to get different events
      // But if filters are active, always start from offset 0 to respect filters
      const hasActiveFilters = 
        (activeFiltersState.genres && activeFiltersState.genres.length > 0) ||
        (activeFiltersState.selectedCities && activeFiltersState.selectedCities.length > 0) ||
        activeFiltersState.dateRange.from || activeFiltersState.dateRange.to ||
        (activeFiltersState.daysOfWeek && activeFiltersState.daysOfWeek.length > 0) ||
        activeFiltersState.filterByFollowing === 'following';
      
      // On refresh, always use offset 0 to reload top results (refreshOffset is reset by handleRefresh)
      // On normal load or with filters, use the provided offset
      const actualOffset = isRefresh ? 0 : offset;
      console.log('🔄 loadFeedData called with offset:', actualOffset, 'isRefresh:', isRefresh, 'isFilterUpdate:', isFilterUpdate, 'hasActiveFilters:', hasActiveFilters);
      
      // For filter updates, keep current feed visible and don't show skeleton
      if (isFilterUpdate) {
        setLoading(false); // Ensure main loading is off
        setLoadingMore(true); // Use subtle loading indicator
        setHasMore(true); // Reset hasMore state
        // Don't clear feedItems - keep showing current items while filtering
      } else if (offset === 0 && !isRefresh) {
        setLoading(true);
        setFeedItems([]); // Clear existing items for fresh load
        setHasMore(true); // Reset hasMore state
      } else if (isRefresh) {
        setLoading(true); // Show loading for refresh
      } else {
        setLoadingMore(true);
      }

      // Removed artificial delay for faster loading

      // Build filter object for personalized feed using ACTUAL filters (not pending)
      // Deduplicate cities to prevent duplicates
      const { deduplicateCities } = await import('@/utils/cityNormalization');
      const deduplicatedCities = activeFiltersState.selectedCities && activeFiltersState.selectedCities.length > 0 
        ? deduplicateCities(activeFiltersState.selectedCities)
        : undefined;
      
      const feedFilters = {
        genres: activeFiltersState.genres && activeFiltersState.genres.length > 0 ? activeFiltersState.genres : undefined,
        selectedCities: deduplicatedCities,
        dateRange:
          activeFiltersState.dateRange.from || activeFiltersState.dateRange.to ? activeFiltersState.dateRange : undefined,
        daysOfWeek:
          activeFiltersState.daysOfWeek && activeFiltersState.daysOfWeek.length > 0
            ? activeFiltersState.daysOfWeek
            : undefined,
        filterByFollowing:
          activeFiltersState.filterByFollowing !== 'all' ? activeFiltersState.filterByFollowing : undefined,
        radiusMiles: activeFiltersState.radiusMiles !== undefined ? activeFiltersState.radiusMiles : undefined,
      };
      
      // Only include filters object if at least one filter is active
      const activeFilters = (
        feedFilters.genres ||
        feedFilters.selectedCities ||
        feedFilters.dateRange ||
        feedFilters.daysOfWeek ||
        feedFilters.filterByFollowing
      ) ? feedFilters : undefined;
      
      const rawItems = await UnifiedFeedService.getFeedItems({
        userId: currentUserId,
        limit: 20,
        offset: actualOffset,
        includePrivateReviews: true,
        filters: activeFilters
      });

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

      if (isFilterUpdate) {
        // Filter update: replace current items with filtered results, keeping feed visible
        setFeedItems(items);
        setRefreshOffset(0);
      } else if (offset === 0 && !isRefresh) {
        setFeedItems(items);
      } else if (isRefresh) {
        // Refresh: replace current items with new ones from offset 0
        if (items.length > 0) {
          setFeedItems(items);
          // Keep refresh offset at 0 since we always reload from top on refresh
          setRefreshOffset(0);
        } else {
          // If no items at current offset, reset to 0 and try again
          console.log('🔄 Refresh: No items at current offset, resetting to 0...');
          setRefreshOffset(0);
          // Try again from the beginning
          const retryItems = await UnifiedFeedService.getFeedItems({
            userId: currentUserId,
            limit: 20,
            offset: 0,
            includePrivateReviews: true
          });
          const filteredRetryItems = retryItems.filter(item => {
            if (item.type === 'review') {
              if ((item as any).deleted_at || (item as any).is_deleted) return false;
              if (!item.content && (!item.photos || item.photos.length === 0)) return false;
              if (item.content === 'ATTENDANCE_ONLY' || item.content === '[deleted]' || item.content === 'DELETED') return false;
            }
            return true;
          });
          if (filteredRetryItems.length > 0) {
            setFeedItems(filteredRetryItems);
            setRefreshOffset(0); // Keep at 0 for refresh (always reload from top)
          } else {
            // Keep existing items if retry also fails
            console.warn('⚠️ Refresh: No items found even at offset 0, keeping existing feed');
          }
        }
      } else {
        setFeedItems(prev => [...prev, ...items]);
      }

      // Check if we have more items - we got a full page (20 items) or exactly requested amount
      // Count events specifically for Events tab
      const eventItems = items.filter(item => item.type === 'event');
      const gotFullPage = items.length >= 20 || eventItems.length >= 20;
      const newHasMore = gotFullPage;
      console.log(`📊 Loaded ${items.length} items (${eventItems.length} events), hasMore: ${newHasMore}`);
      setHasMore(newHasMore);
      
      // Load interested events for the events in the feed
      if (currentUserId && eventItems.length > 0) {
        loadInterestedEventsForFeed(eventItems.map(item => item.event_data?.id).filter(Boolean) as string[]);
      }
      
    } catch (error) {
      console.error('Error loading feed data:', error);
      
      // If refresh failed and we have no items, try one more time from offset 0
      if (isRefresh && feedItems.length === 0) {
        console.log('🔄 Refresh failed with no items, retrying from offset 0...');
        try {
          const retryItems = await UnifiedFeedService.getFeedItems({
            userId: currentUserId,
            limit: 20,
            offset: 0,
            includePrivateReviews: true
          });
          const filteredRetryItems = retryItems.filter(item => {
            if (item.type === 'review') {
              if ((item as any).deleted_at || (item as any).is_deleted) return false;
              if (!item.content && (!item.photos || item.photos.length === 0)) return false;
              if (item.content === 'ATTENDANCE_ONLY' || item.content === '[deleted]' || item.content === 'DELETED') return false;
            }
            return true;
          });
          if (filteredRetryItems.length > 0) {
            setFeedItems(filteredRetryItems);
            setRefreshOffset(20);
            return; // Success, exit early
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
        }
      }
      
      toast({
        title: "Error",
        description: "Failed to load feed data. Please try again.",
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

  // Load interested events for events in the feed
  const loadInterestedEventsForFeed = async (eventIds: string[]) => {
    if (!currentUserId || eventIds.length === 0) return;
    
    try {
      // Query relationships table to get all events user is interested in
      const { data, error } = await supabase
        .from('relationships')
        .select('related_entity_id')
        .eq('relationship_type', 'interest')
        .eq('user_id', currentUserId)
        .eq('related_entity_type', 'event')
        .in('related_entity_id', eventIds);
      
      if (error) {
        console.error('Error loading interested events:', error);
        return;
      }
      
      // Extract event IDs
      const allInterestedIds = new Set<string>();
      if (data) {
        data.forEach((row: any) => {
          if (row.related_entity_id) {
            allInterestedIds.add(String(row.related_entity_id));
          }
        });
      }
      
      // Update interestedEvents state
      setInterestedEvents(prev => {
        const newSet = new Set(prev);
        allInterestedIds.forEach(id => newSet.add(id));
        return newSet;
      });
      
      console.log('✅ Loaded interested events:', allInterestedIds.size, 'events');
    } catch (error) {
      console.error('Error loading interested events for feed:', error);
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
      } else if (item.type === 'review') {
        // For reviews, open ReviewShareModal
        // Convert UnifiedFeedItem to ReviewWithEngagement format
        const review = {
          id: item.review_id || item.id,
          user_id: item.author?.id || currentUserId,
          event_id: (item as any).event_id || '',
          rating: typeof item.rating === 'number' ? item.rating : ((item as any).artist_performance_rating as number) || 0,
          review_text: item.content || '',
          is_public: true,
          created_at: item.created_at,
          updated_at: item.updated_at || item.created_at,
          likes_count: item.likes_count || 0,
          comments_count: item.comments_count || 0,
          shares_count: item.shares_count || 0,
          is_liked_by_user: likedPosts.has(item.id),
          reaction_emoji: '',
          photos: item.photos || [],
          videos: [],
          mood_tags: [],
          genre_tags: [],
          context_tags: [],
          artist_name: item.event_info?.artist_name,
          artist_id: (item.event_info as any)?.artist_id,
          venue_name: item.event_info?.venue_name,
          venue_id: (item.event_info as any)?.venue_id,
        } as ReviewWithEngagement;
        
        setSelectedReviewForShare(review);
        setReviewShareModalOpen(true);
      } else {
        // For other types, just copy to clipboard
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
    
    // Toggle interest without opening the modal
    const isCurrentlyInterested = interestedEvents.has(item.event_data.id);
    const newInterestState = !isCurrentlyInterested;
    
    // Optimistically update UI
    if (newInterestState) {
      interestedEvents.add(item.event_data.id);
    } else {
      interestedEvents.delete(item.event_data.id);
    }
    setInterestedEvents(new Set(interestedEvents));
    
    // Update in database
    try {
      await UserEventService.setEventInterest(
        currentUserId,
        item.event_data.id,
        newInterestState
      );
      
      toast({
        title: newInterestState ? "You're interested!" : "Interest removed",
        description: newInterestState 
          ? "We'll notify you about this event" 
          : "You'll no longer receive notifications for this event",
      });
    } catch (error) {
      console.error('Error toggling interest:', error);
      // Revert optimistic update
      if (newInterestState) {
        interestedEvents.delete(item.event_data.id);
      } else {
        interestedEvents.add(item.event_data.id);
      }
      setInterestedEvents(new Set(interestedEvents));
      
      toast({
        title: "Error",
        description: "Failed to update interest",
        variant: "destructive",
      });
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

  // Load cities for filters
  const loadCities = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('venue_city')
        .not('venue_city', 'is', null);
      if (error) throw error;
      const unique = Array.from(new Set((data || []).map((r: any) => (r.venue_city as string).trim()).filter(Boolean))).sort();
      setAvailableCities(unique);
    } catch (error) {
      console.error('Failed to load cities:', error);
      setAvailableCities([]);
    }
  };

  // Available genres from feed items
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>();
    feedItems.forEach(item => {
      if (item.type === 'event' && item.event_data?.genres) {
        item.event_data.genres.forEach((genre: string) => genreSet.add(genre));
      }
    });
    return Array.from(genreSet).sort();
  }, [feedItems]);

  // Note: Filters are now applied at the database level when generating the personalized feed
  // This filteredFeedItems is kept for backward compatibility and to handle the following filter
  // which requires client-side logic with follow lists
  // Use actual filters (not pending) for display
  const filteredFeedItems = useMemo(() => {
    let filtered = [...feedItems];

    // Only apply following filter client-side (others are applied at DB level)
    if (filters.filterByFollowing === 'following') {
      const eventItems = filtered.filter(item => item.type === 'event');
      const nonEventItems = filtered.filter(item => item.type !== 'event');

      const filteredEvents = eventItems.filter(item => {
        if (!item.event_data) return false;
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
        
        return false;
      });

      return [...filteredEvents, ...nonEventItems];
    }

    // No filters or only DB-level filters (already applied)
    return filtered;
  }, [feedItems, filters.filterByFollowing, followedArtists, followedVenues]);

  // Handle refresh button - reload top personalized events
  const handleRefresh = async () => {
    try {
      setLoading(true);
      // Reset refresh offset to 0 to reload top personalized results
      // This ensures we get the best personalized events (not rotated through offsets)
      setRefreshOffset(0);
      
      // Reload from offset 0 with isRefresh flag
      await loadFeedData(0, true);
      
      toast({
        title: "Feed Refreshed",
        description: "Loaded fresh personalized events for you",
      });
    } catch (error) {
      console.error('Error refreshing feed:', error);
      toast({
        title: "Error",
        description: "Failed to refresh feed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Sync pending filters when actual filters change (e.g., from clear all)
  useEffect(() => {
    setPendingFilters(filters);
  }, [filters]);
  
  // Apply filters button handler - applies pending filters and triggers feed refresh
  const handleApplyFilters = () => {
    console.log('✅ Applying filters:', pendingFilters);
    
    // Mark that user has manually changed filters (disable auto-city logic)
    userHasChangedFiltersRef.current = true;
    autoCityAppliedRef.current = true;
    
    setFilters(pendingFilters);
    setRefreshOffset(0);
    
    // Check if any filters are active
    const hasActiveFilters = 
      (pendingFilters.genres && pendingFilters.genres.length > 0) ||
      (pendingFilters.selectedCities && pendingFilters.selectedCities.length > 0) ||
      pendingFilters.dateRange.from || pendingFilters.dateRange.to ||
      (pendingFilters.daysOfWeek && pendingFilters.daysOfWeek.length > 0) ||
      pendingFilters.filterByFollowing === 'following';
    
    if (currentUserId) {
      console.log(hasActiveFilters ? '🔄 Filters applied, regenerating personalized feed...' : '🔄 Clearing filters, loading regular feed...');
      loadFeedData(0, false, true, pendingFilters);
    }
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
    // filteredFeedItems already includes all filtering logic (genres, cities, dates, days, following)
    return sortFeedItems(filteredFeedItems);
  }, [filteredFeedItems, sortBy, sortOrder]);

  const mapEvents = useMemo<JamBaseEventResponse[]>(() => {
    return processedFeedItems
      .filter((item): item is UnifiedFeedItem & { event_data: any } => item.type === 'event' && !!item.event_data)
      .map((item) => {
        const event = item.event_data;
        const latitude = event.latitude != null ? Number(event.latitude) : undefined;
        const longitude = event.longitude != null ? Number(event.longitude) : undefined;

        return {
          id: event.id,
          jambase_event_id: event.jambase_event_id ?? event.id,
          title: event.title ?? event.artist_name ?? 'Untitled Event',
          artist_name: event.artist_name ?? '',
          artist_id: event.artist_id ?? '',
          venue_name: event.venue_name ?? '',
          venue_id: event.venue_id ?? '',
          event_date: event.event_date,
          doors_time: event.doors_time,
          description: event.description,
          genres: event.genres ?? [],
          venue_address: event.venue_address,
          venue_city: event.venue_city,
          venue_state: event.venue_state,
          venue_zip: event.venue_zip,
          latitude,
          longitude,
          ticket_available: event.ticket_available,
          price_range: event.price_range,
          ticket_urls: event.ticket_urls ?? (event.ticket_url ? [event.ticket_url] : []),
          poster_image_url: event.poster_image_url ?? null,
          setlist: event.setlist ?? null,
          setlist_enriched: event.setlist_enriched ?? false,
          setlist_song_count: event.setlist_song_count ?? null,
          setlist_fm_id: event.setlist_fm_id ?? null,
          setlist_fm_url: event.setlist_fm_url ?? null,
          setlist_source: event.setlist_source ?? null,
          setlist_last_updated: event.setlist_last_updated ?? null,
          tour_name: event.tour_name ?? null,
          created_at: event.created_at ?? null,
          updated_at: event.updated_at ?? null,
          is_promoted: event.is_promoted ?? false,
          promotion_tier: event.promotion_tier ?? null,
          active_promotion_id: event.active_promotion_id ?? null,
          ticket_price_min: event.ticket_price_min ?? null,
          ticket_price_max: event.ticket_price_max ?? null,
        } as JamBaseEventResponse;
      })
      .filter((event) => typeof event.latitude === 'number' && typeof event.longitude === 'number');
  }, [processedFeedItems]);

  const mapZoomLevel = mapEvents.length > 1 ? 6 : 9;

  const heroHighlight = useMemo<FeedHeroHighlight | null>(() => {
    const candidate = processedFeedItems.find(
      (item): item is UnifiedFeedItem & { event_data: any } =>
        item.type === 'event' && !!item.event_data
    );

    if (!candidate || !candidate.event_data) {
      return null;
    }

    const event = candidate.event_data as any;
    const imageUrl =
      event.poster_image_url ||
      (Array.isArray(event.images)
        ? (event.images.find((img: any) => img?.url)?.url as string | undefined)
        : undefined) ||
      null;

    return {
      eventId: event.id || candidate.id,
      title: event.title || candidate.title || event.artist_name || 'Upcoming Event',
      artistName: event.artist_name || candidate.event_info?.artist_name,
      venueName: event.venue_name || candidate.event_info?.venue_name,
      eventDate: event.event_date || candidate.event_info?.event_date,
      imageUrl,
      distanceMiles: candidate.distance_miles,
      eventData: event,
    };
  }, [processedFeedItems]);

  useEffect(() => {
    if (onHighlightUpdate) {
      onHighlightUpdate(heroHighlight);
    }
  }, [heroHighlight, onHighlightUpdate]);

  useEffect(() => {
    if (isMapDialogOpen) return;
    const firstWithCoords = mapEvents.find(
      (event) => typeof event.latitude === 'number' && typeof event.longitude === 'number'
    );
    if (firstWithCoords && typeof firstWithCoords.latitude === 'number' && typeof firstWithCoords.longitude === 'number') {
      setMapCenter([firstWithCoords.latitude, firstWithCoords.longitude]);
    } else {
      setMapCenter(DEFAULT_MAP_CENTER);
    }
  }, [mapEvents, isMapDialogOpen]);

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
          // Debug: Resolving image for event
          
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
          // Query events first, then find reviews for those events
          const { data: matchingEvents } = await supabase
            .from('events')
            .select('id')
            .ilike('artist_name', `%${artistName}%`)
            .limit(20);
          
          if (matchingEvents && matchingEvents.length > 0) {
            const eventIds = matchingEvents.map(e => e.id);
            const artist = await supabase
              .from('reviews')
              .select('photos')
              .not('photos', 'is', null)
              .in('event_id', eventIds)
              .order('likes_count', { ascending: false })
              .limit(1);
            
            const artistImg = Array.isArray(artist.data) && artist.data[0]?.photos?.[0];
            if (artistImg) { 
              console.log('ReviewHeroImage: Using artist review photo:', artistImg);
              setUrl(artistImg); 
              return; 
            }
          }

          // No image found for event (removed fallback to reviews_with_event_details - view doesn't exist)
          setUrl(null);
        } catch (error) {
          console.error('ReviewHeroImage: Error resolving image:', error);
          setUrl(null);
        }
      })();
    }, [item.id, item.photos, item.event_info?.artist_name]);

    // Rendering hero image
    if (!url) return null;
    return (
      <div className="h-44 w-full overflow-hidden rounded-t-lg">
        <img src={url} alt={item.event_info?.event_name || item.title} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  };

  // (Reverted) No custom EventHeroImage in unified feed

        // UnifiedFeed render

  const renderEventFiltersBlock = () => (
    <div className={`${isEmbedded ? 'mb-2' : 'mb-6'} lg:sticky lg:top-6 lg:z-20`}>
      <div className="rounded-2xl border border-white/60 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
          <div className="md:flex-1">
            <EventFilters
              filters={pendingFilters}
              onFiltersChange={(newFilters) => {
                console.log('✅ Filter change detected:', newFilters);
                userHasChangedFiltersRef.current = true;
                autoCityAppliedRef.current = true;
                setPendingFilters(newFilters);

                if (filterDebounceTimeoutRef.current) {
                  clearTimeout(filterDebounceTimeoutRef.current);
                }

                filterDebounceTimeoutRef.current = setTimeout(() => {
                  console.log('🔄 Applying debounced filters, regenerating personalized feed...');
                  setFilters(newFilters);
                  setRefreshOffset(0);

                  if (currentUserId) {
                    loadFeedData(0, false, true, newFilters);
                  }
                }, 400);
              }}
              availableGenres={availableGenres}
              availableCities={availableCities}
              onOverlayChange={(open) => setPendingFilters((prev) => ({ ...prev, showFilters: open }))}
            />
          </div>
          {mapEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="md:self-start"
              onClick={() => setIsMapDialogOpen(true)}
              disabled={mapEvents.length === 0}
            >
              <MapIcon className="h-4 w-4 mr-2" />
              Map View
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-1 px-3 pb-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>Tune these recommendations by genre, location, and dates.</span>
          <span className="hidden md:inline">Filters apply across events and reviews.</span>
        </div>
      </div>
    </div>
  );

  const renderEventsBody = (includeFilters = true) => (
    <>
      {includeFilters && renderEventFiltersBlock()}
      {renderEventCards()}
      {renderLoadMoreButton()}
    </>
  );

  const renderEventCards = () => (
    <div className="space-y-4">
      {processedFeedItems
        .filter((item) => item.type === 'event')
        .map((item, index) => (
          <Card
            key={`event-${item.id}-${index}`}
            className={cn(
              'cursor-pointer overflow-hidden group',
              item.event_data?.is_promoted &&
                'ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-200/30 border-yellow-200/50'
            )}
            ref={(el) => el && attachEventObserver(el, item.event_data?.id || item.id)}
            data-tour={index === 0 ? 'event-card' : undefined}
            onClick={async (e) => {
              if (e.defaultPrevented) return;
              if (item.event_data) {
                const { PromotionTrackingService } = await import('@/services/promotionTrackingService');
                PromotionTrackingService.trackPromotionInteraction(item.event_data.id, currentUserId, 'click', {
                  source: 'feed_event_card_click',
                  artist_name: item.event_data.artist_name,
                  venue_name: item.event_data.venue_name,
                });

                setSelectedEventForDetails(item.event_data);
                try {
                  const interested = await UserEventService.isUserInterested(currentUserId, item.event_data.id);
                  setSelectedEventInterested(interested);
                } catch {
                  setSelectedEventInterested(false);
                }
                setDetailsOpen(true);
              }
            }}
          >
            <CardContent className="p-6">
              {item.type !== 'event' && (
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 ring-2 ring-synth-pink/20">
                      <AvatarImage src={item.author?.avatar_url || undefined} />
                      <AvatarFallback className="text-sm font-semibold bg-synth-pink/10 text-synth-pink">
                        {item.author?.name?.split(' ').map((n) => n[0]).join('') || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">{item.author?.name || 'Anonymous'}</h3>
                      <p className="text-xs text-gray-500">{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</p>
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

              <div className="mb-4">
                <ReviewHeroImage item={item} />
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-bold text-lg text-gray-900">
                      {item.event_data?.artist_name ? (
                        <span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/artist/${encodeURIComponent(item.event_data.artist_name)}`);
                            }}
                            className="hover:text-synth-pink transition-colors underline"
                          >
                            {item.event_data.artist_name}
                          </button>
                          {item.title && item.title !== item.event_data.artist_name && (
                            <span> - {item.title}</span>
                          )}
                        </span>
                      ) : (
                        item.title
                      )}
                    </h2>
                    <div className="flex items-center gap-2">
                      <FollowIndicator
                        followedArtists={followedArtists}
                        followedVenues={followedVenues}
                        artistName={item.event_data?.artist_name}
                        venueName={item.event_data?.venue_name}
                        venueCity={item.event_data?.venue_city}
                        venueState={item.event_data?.venue_state}
                      />
                      {item.event_data?.is_promoted && item.event_data?.promotion_tier && (
                        <PromotedEventBadge promotionTier={item.event_data.promotion_tier as 'basic' | 'premium' | 'featured'} />
                      )}
                    </div>
                  </div>
                  {item.event_data && (
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-synth-pink" />
                        {item.event_data.venue_name && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/venue/${encodeURIComponent(item.event_data.venue_name)}`);
                            }}
                            className="hover:text-synth-pink transition-colors underline"
                          >
                            {item.event_data.venue_name}
                          </button>
                        )}
                        {item.event_data.venue_city && (
                          <span className="text-gray-500">· {item.event_data.venue_city}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-synth-pink" />
                        <span>{format(parseISO(item.event_data.event_date), 'EEEE, MMMM d, yyyy')}</span>
                      </div>
                      {(() => {
                        const event = item.event_data as any;
                        const priceRange = event?.price_range;
                        const priceMin = event?.ticket_price_min ?? event?.price_min;
                        const priceMax = event?.ticket_price_max ?? event?.price_max;
                        if (priceRange || priceMin || priceMax) {
                          let priceDisplay = '';
                          if (priceRange) {
                            priceDisplay = formatPrice(priceRange);
                          } else if (priceMin && priceMax) {
                            priceDisplay = `$${priceMin} - $${priceMax}`;
                          } else if (priceMin) {
                            priceDisplay = `$${priceMin}+`;
                          } else if (priceMax) {
                            priceDisplay = `Up to $${priceMax}`;
                          }
                          return (
                            <div className="flex items-center gap-2">
                              <Ticket className="w-4 h-4 text-synth-pink" />
                              <span className="font-medium">{priceDisplay}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
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
                        className={cn(
                          'flex items-center gap-1 text-sm transition-colors px-3 py-1 rounded-md',
                          interestedEvents.has(item.event_data.id)
                            ? 'bg-pink-500 text-white hover:bg-pink-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        <Heart className={cn('w-4 h-4', interestedEvents.has(item.event_data.id) && 'fill-current')} />
                        <span>{interestedEvents.has(item.event_data.id) ? 'Interested' : "I'm Interested"}</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInstagramLike(item);
                        }}
                        className={cn(
                          'flex items-center gap-1 text-sm transition-colors',
                          likedPosts.has(item.id) ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
                        )}
                      >
                        <Heart className={cn('w-4 h-4', likedPosts.has(item.id) && 'fill-current')} />
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
                  <div className="text-xs text-gray-400">{formatTimeAgo(item.created_at)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );

  const renderLoadMoreButton = () => {
    if (feedItems.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-col items-center justify-center py-6 mt-6">
        {!hasMore && <p className="text-gray-500 text-sm mb-3">You're all caught up! 🎉</p>}
        <Button
          onClick={() => loadFeedData(feedItems.length)}
          disabled={loadingMore || !hasMore}
          className={cn(
            'text-white shadow-lg px-6 py-2',
            hasMore ? 'bg-synth-pink hover:bg-synth-pink-dark' : 'bg-gray-400 cursor-not-allowed'
          )}
        >
          {loadingMore ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading more events...
            </>
          ) : hasMore ? (
            <>Load more (20 events)</>
          ) : (
            <>You're all caught up</>
          )}
        </Button>
      </div>
    );
  };

  const renderReviewsBody = () => {
    const reviews = feedItems.filter(
      (item) => item.type === 'review' && !(item as any).deleted_at && !(item as any).is_deleted
    );

    if (reviews.length === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No reviews yet</h3>
            <p className="text-gray-500">Be the first to share a concert review!</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {reviews.map((item, index) => {
          const review = {
            id: item.review_id || item.id,
            user_id: item.author?.id || currentUserId,
            event_id: (item as any).event_id || '',
            rating:
              typeof item.rating === 'number'
                ? item.rating
                : ((item as any).artist_performance_rating as number) || 0,
            review_text: item.content || '',
            is_public: true,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at,
            likes_count: item.likes_count || 0,
            comments_count: item.comments_count || 0,
            shares_count: item.shares_count || 0,
            is_liked_by_user: likedPosts.has(item.id),
            reaction_emoji: '',
            photos: item.photos || [],
            videos: [],
            mood_tags: [],
            genre_tags: [],
            context_tags: [],
            artist_name: item.event_info?.artist_name,
            artist_id: (item.event_info as any)?.artist_id,
            venue_name: item.event_info?.venue_name,
            venue_id: (item.event_info as any)?.venue_id,
          } as ReviewWithEngagement;

          return (
            <ReviewCard
              key={`${item.id}-${index}`}
              review={review}
              userProfile={{
                name: item.author?.name || 'User',
                avatar_url: item.author?.avatar_url || undefined,
                verified: (item.author as any)?.verified,
                account_type: (item.author as any)?.account_type,
              }}
              isLiked={likedPosts.has(item.id)}
              onLike={(reviewId) => {
                const isLiked = likedPosts.has(item.id);
                if (isLiked) {
                  setLikedPosts((prev) => {
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                  });
                } else {
                  setLikedPosts((prev) => new Set([...prev, item.id]));
                }
                handleInstagramLike(item);
              }}
              onComment={() => setOpenReviewCommentsFor(item.review_id || item.id)}
              onShare={(reviewId) => {
                // Use the current item (it's already in scope)
                handleShare(item);
              }}
              onOpenReviewDetail={(review) => {
                setSelectedReviewDetail(item);
                setShowReviewDetailModal(true);
              }}
              onOpenArtist={(artistId, artistName) => {
                navigate(`/artist/${encodeURIComponent(artistName)}`);
              }}
              onOpenVenue={(venueId, venueName) => {
                navigate(`/venue/${encodeURIComponent(venueName)}`);
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderNewsBody = () => {
    if (newsLoading && newsArticles.length === 0) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <NewsCardSkeleton key={index} />
          ))}
        </div>
      );
    }

    if (!newsLoading && newsArticles.length === 0) {
      return (
        <EmptyState
          icon={<Newspaper className="w-12 h-12 text-gray-400" />}
          title="No news articles found"
          description="Check back later for the latest music news and updates!"
        />
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {NewsService.filterBySource(newsArticles, newsSource).map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
    );
  };

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
    <div className={outerClassName}>
      <div className={innerClassName}>
        {shouldRenderHeader && (
        <div className={headerSpacingClass}>
          <div>
              {shouldShowHeaderTitle && (
                <h1 className="text-3xl font-bold text-gray-900">{normalizedHeaderTitle}</h1>
              )}
              {shouldShowHeaderSubtitle && (
                <p className="text-gray-600 mt-2">{normalizedHeaderSubtitle}</p>
            )}
          </div>
        </div>
        )}

        {/* Feed type tabs */}
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as FeedSectionKey)}>
          {showSectionTabs !== false && (
            <TabsList className={`grid w-full ${isEmbedded ? 'mb-1 mt-0' : 'mb-6'} bg-white/60 backdrop-blur-sm border border-white/20 rounded-2xl p-1 ${sectionGridClass}`}>
              {resolvedSections.map((section) => {
                const { label, icon: Icon } = SECTION_META[section];
                return (
                  <TabsTrigger
                    key={section}
                    value={section}
                    className="flex items-center gap-2 data-[state=active]:bg-synth-pink data-[state=active]:text-white rounded-xl"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
            </TabsTrigger>
                );
              })}
          </TabsList>
          )}

          {/* Filters and Refresh Button - Only show on Events tab */}
          {activeTab === 'events' && resolvedSections.includes('events') && (
            <div className={`${isEmbedded ? 'mb-1 pt-0' : 'mb-6'} flex flex-col gap-2 md:flex-row md:items-center md:justify-between`}>
              <div className={`${isEmbedded ? 'flex-1' : 'md:flex-1'}`}>
                <EventFilters
                  filters={pendingFilters}
                  onFiltersChange={(newFilters) => {
                    console.log('✅ Filter change detected:', newFilters);
                    userHasChangedFiltersRef.current = true;
                    autoCityAppliedRef.current = true;
                    setPendingFilters(newFilters);

                    if (filterDebounceTimeoutRef.current) {
                      clearTimeout(filterDebounceTimeoutRef.current);
                    }

                    filterDebounceTimeoutRef.current = setTimeout(() => {
                      console.log('🔄 Applying debounced filters, regenerating personalized feed...');
                      setFilters(newFilters);
                      setRefreshOffset(0);

                      if (currentUserId) {
                        loadFeedData(0, false, true, newFilters);
                      }
                    }, 400);
                  }}
                  availableGenres={availableGenres}
                  availableCities={availableCities}
                  onOverlayChange={(open) => setPendingFilters(prev => ({ ...prev, showFilters: open }))}
                  className={isEmbedded ? 'space-y-0' : ''}
                />
              </div>
              {isEmbedded && onNavigateToNotifications && onNavigateToChat && (
                <div className="flex items-center gap-2 flex-shrink-0 -mt-1">
                  <PageActions
                    currentUserId={currentUserId}
                    onNavigateToNotifications={onNavigateToNotifications}
                    onNavigateToChat={onNavigateToChat}
                    className="flex-shrink-0"
                  />
                </div>
              )}
              {!isEmbedded && mapEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="md:self-start"
                  onClick={() => setIsMapDialogOpen(true)}
                  disabled={mapEvents.length === 0}
                >
                  <MapIcon className="h-4 w-4 mr-2" />
                  Map View
                </Button>
              )}
            </div>
          )}

          {resolvedSections.includes('events') && (
          <TabsContent
            value="events"
            className="mt-0 space-y-4"
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
                            {item.event_data.venue_city && (
                              <span className="text-gray-500">· {item.event_data.venue_city}</span>
                            )}
                        </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-synth-pink" />
                            <span>{format(parseISO(item.event_data.event_date), 'EEEE, MMMM d, yyyy')}</span>
                          </div>
                          {(() => {
                            const event = item.event_data as any;
                            const priceRange = event?.price_range;
                            const priceMin = event?.ticket_price_min ?? event?.price_min;
                            const priceMax = event?.ticket_price_max ?? event?.price_max;
                            
                            // Show price if any price data exists
                            if (priceRange || priceMin || priceMax) {
                              let priceDisplay = '';
                              if (priceRange) {
                                priceDisplay = formatPrice(priceRange);
                              } else if (priceMin && priceMax) {
                                priceDisplay = `$${priceMin} - $${priceMax}`;
                              } else if (priceMin) {
                                priceDisplay = `$${priceMin}+`;
                              } else if (priceMax) {
                                priceDisplay = `Up to $${priceMax}`;
                              }
                              
                              return (
                                <div className="flex items-center gap-2">
                                  <Ticket className="w-4 h-4 text-synth-pink" />
                                  <span className="font-medium">{priceDisplay}</span>
                                </div>
                              );
                            }
                            return null;
                          })()}
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

            {/* Load More - Always visible, persistent button */}
            {feedItems.length > 0 && (
              <div className="flex flex-col items-center justify-center py-6 mt-6">
                {!hasMore && (
                  <p className="text-gray-500 text-sm mb-3">You're all caught up! 🎉</p>
                )}
                <Button
                  onClick={() => loadFeedData(feedItems.length)}
                  disabled={loadingMore || !hasMore}
                  className={cn(
                    "text-white shadow-lg px-6 py-2",
                    hasMore 
                      ? "bg-synth-pink hover:bg-synth-pink-dark" 
                      : "bg-gray-400 cursor-not-allowed"
                  )}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading more events...
                    </>
                  ) : hasMore ? (
                    <>Load more (20 events)</>
                  ) : (
                    <>You're all caught up</>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
          )}

          {resolvedSections.includes('reviews') && (
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
                      // Use item.rating directly - it should be a number from the database
                      rating: typeof item.rating === 'number' 
                        ? item.rating 
                        : (typeof item.rating === 'string' ? parseFloat(item.rating) : null) ?? 0,
                      review_text: item.content || '',
                      is_public: true,
                      created_at: item.created_at,
                      updated_at: item.updated_at || item.created_at,
                      likes_count: item.likes_count || 0,
                      comments_count: item.comments_count || 0,
                      shares_count: item.shares_count || 0,
                      is_liked_by_user: likedPosts.has(item.id),
                      reaction_emoji: (item as any).reaction_emoji || '',
                      photos: item.photos || [],
                      videos: [],
                      mood_tags: [],
                      genre_tags: [],
                      context_tags: [],
                      artist_name: item.event_info?.artist_name,
                      venue_name: item.event_info?.venue_name,
                      artist_performance_rating: (item as any).artist_performance_rating,
                      production_rating: (item as any).production_rating,
                      venue_rating: (item as any).venue_rating,
                      location_rating: (item as any).location_rating,
                      value_rating: (item as any).value_rating,
                      artist_performance_feedback: (item as any).artist_performance_feedback,
                      production_feedback: (item as any).production_feedback,
                      venue_feedback: (item as any).venue_feedback,
                      location_feedback: (item as any).location_feedback,
                      value_feedback: (item as any).value_feedback,
                      ticket_price_paid: (item as any).ticket_price_paid,
                      setlist: (item as any).setlist,
                      custom_setlist: (item as any).custom_setlist,
                      // Pass connection degree data from UnifiedFeedItem
                      connection_degree: item.connection_degree,
                      connection_type_label: item.connection_type_label
                    } as any}
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
                    onShare={(reviewId) => {
                      // Use the current item (it's already in scope)
                      handleShare(item);
                    }}
                    onEdit={() => {
                      console.log('Edit button clicked for review:', item.review_id || item.id);
                      console.log('Full item data:', item);
                      
                      // Fetch the full review data from the database
                      const fetchFullReviewData = async () => {
                        try {
                          // Get the event_id from the review
                          const { data: reviewData, error: reviewError } = await supabase
                            .from('reviews')
                            .select(`
                              *,
                              events!inner (
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
                          
                          if (reviewData && reviewData.events) {
                            const event = reviewData.events;
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
                                artist_performance_rating: review.artist_performance_rating,
                                production_rating: review.production_rating,
                                venue_rating: review.venue_rating,
                                location_rating: review.location_rating,
                                value_rating: review.value_rating,
                                artist_performance_feedback: review.artist_performance_feedback,
                                production_feedback: review.production_feedback,
                                venue_feedback: review.venue_feedback,
                                location_feedback: review.location_feedback,
                                value_feedback: review.value_feedback,
                                ticket_price_paid: review.ticket_price_paid,
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
          )}

          {resolvedSections.includes('news') && (
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
          )}
        </Tabs>

        {mapEnabled && (
        <Dialog open={isMapDialogOpen} onOpenChange={setIsMapDialogOpen}>
          <DialogContent className="sm:max-w-[900px] w-full h-[80vh]">
            <DialogHeader>
              <DialogTitle>Events Map</DialogTitle>
              <DialogDescription>
                Explore upcoming events from your feed on an interactive map.
              </DialogDescription>
            </DialogHeader>
            {mapEvents.length > 0 ? (
              <div className="h-[calc(80vh-120px)] w-full">
                <EventMap
                  center={mapCenter}
                  zoom={mapZoomLevel}
                  events={mapEvents}
                  onEventClick={handleMapEventClick}
                  onMapCenterChange={(center) => setMapCenter(center)}
                />
              </div>
            ) : (
              <div className="flex h-[calc(80vh-120px)] items-center justify-center rounded-lg border border-dashed border-muted-foreground/40">
                <p className="px-6 text-center text-sm text-muted-foreground">
                  No events in your feed have location data yet. Try adjusting your filters or check back soon.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
        )}
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
            
            // Update the feed items locally
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
            
            // Refresh feed to ensure all event cards reflect the new interest state
            // Use a small delay to allow database write to complete
            setTimeout(() => {
              loadFeedData(0, false);
            }, 500);
            
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

      {reviewShareModalOpen && selectedReviewForShare && (
      <ReviewShareModal
        review={selectedReviewForShare}
        currentUserId={currentUserId}
        isOpen={reviewShareModalOpen}
        onClose={() => {
          setReviewShareModalOpen(false);
          setSelectedReviewForShare(null);
        }}
      />
      )}

      {/* Report modal temporarily disabled due to prop mismatch */}

      {showUnifiedChat && (
        <UnifiedChatView 
          currentUserId={currentUserId} 
          onBack={() => setShowUnifiedChat(false)} 
        />
      )}

      {/* Bottom Navigation - Hide when chat is open or when embedded (MainApp handles navigation) */}
      {!showUnifiedChat && onViewChange && !isEmbedded && (
        <Navigation 
          currentView="feed" 
          onViewChange={onViewChange} 
        />
      )}

      {/* Review Detail Modal - Instagram-style layout */}
      {showReviewDetailModal && selectedReviewDetail && (
        <Dialog open={showReviewDetailModal} onOpenChange={setShowReviewDetailModal}>
          <DialogContent className="max-w-5xl w-[90vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex">
            <DialogTitle className="sr-only">Review Details</DialogTitle>
            <DialogDescription className="sr-only">Review details for {selectedReviewDetail.event_info?.artist_name || 'artist'}</DialogDescription>
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
      <Dialog open={artistDialog.open} onOpenChange={(open) => setArtistDialog({ open, artist: null, events: undefined, totalEvents: undefined })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Artist Profile</DialogTitle>
          <DialogDescription className="sr-only">Artist profile for {artistDialog.artist?.name || 'artist'}</DialogDescription>
          {artistDialog.artist && (
            artistDialogLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
                <span className="ml-2">Loading events...</span>
              </div>
            ) : (
              <ArtistCard
                artist={artistDialog.artist}
                events={artistDialog.events || []}
                totalEvents={artistDialog.totalEvents || 0}
                source={artistDialog.events && artistDialog.events.length > 0 ? 'api' : 'database'}
                userId={currentUserId}
                onBack={() => setArtistDialog({ open: false, artist: null, events: undefined, totalEvents: undefined })}
                showAllEvents={true}
              />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Venue Dialog */}
      <Dialog open={venueDialog.open} onOpenChange={(open) => setVenueDialog({ open, venueId: null, venueName: '' })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Venue Profile</DialogTitle>
          <DialogDescription className="sr-only">Venue profile for {venueDialog.venueName || 'venue'}</DialogDescription>
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
