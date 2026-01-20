import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PreferencesV4FeedService, type PreferencesV4FeedFilters } from '@/services/preferencesV4FeedService';
import { PersonalizedFeedService, type PersonalizedEvent } from '@/services/personalizedFeedService';
import { HomeFeedService, type NetworkEvent, type TrendingEvent } from '@/services/homeFeedService';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import { CompactEventCard, type EventReason } from './CompactEventCard';
import { SynthLoadingInline, SynthLoader } from '@/components/ui/SynthLoader';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import type { PersonalizedFeedFilters } from '@/services/personalizedFeedService';

interface UnifiedEventItem {
  event_id: string;
  title: string;
  artist_name?: string;
  venue_name?: string;
  venue_city?: string;
  event_date: string;
  image_url?: string;
  poster_image_url?: string;
  images?: any;
  event_media_url?: string;
  reason: EventReason;
  interested_count?: number;
  user_is_interested?: boolean;
  // For following events - track which entity is being followed
  followed_artist_id?: string;
  followed_venue_id?: string;
}

interface UnifiedEventsFeedProps {
  currentUserId: string;
  filters?: PreferencesV4FeedFilters | any; // Accept FilterState or PreferencesV4FeedFilters
  onEventClick?: (eventId: string) => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onShareClick?: (event: UnifiedEventItem, e: React.MouseEvent) => void;
}

export const UnifiedEventsFeed: React.FC<UnifiedEventsFeedProps> = ({
  currentUserId,
  filters,
  onEventClick,
  onInterestToggle,
  onShareClick,
}) => {
  const [events, setEvents] = useState<UnifiedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [followingArtists, setFollowingArtists] = useState<Set<string>>(new Set());
  const [followingVenues, setFollowingVenues] = useState<Set<string>>(new Set());

  // Load following artists and venues
  useEffect(() => {
    const loadFollowing = async () => {
      try {
        // Load followed artists
        const { data: artistFollows } = await supabase
          .from('artist_follows')
          .select('artist_id')
          .eq('user_id', currentUserId);
        
        if (artistFollows) {
          setFollowingArtists(new Set(artistFollows.map(af => af.artist_id)));
        }

        // Load followed venues
        const { data: venueFollows } = await supabase
          .from('user_venue_relationships')
          .select('venue_id')
          .eq('user_id', currentUserId);
        
        if (venueFollows) {
          setFollowingVenues(new Set(venueFollows.map(vf => vf.venue_id)));
        }
      } catch (error) {
        console.error('Error loading following:', error);
      }
    };

    loadFollowing();
  }, [currentUserId]);

  // Load user's interested events
  useEffect(() => {
    const loadInterestedEvents = async () => {
      try {
        const { data: relationships } = await supabase
          .from('user_event_relationships')
          .select('event_id')
          .eq('user_id', currentUserId)
          .eq('relationship_type', 'interested');
        
        if (relationships) {
          setInterestedEvents(new Set(relationships.map(r => r.event_id)));
        }
      } catch (error) {
        console.error('Error loading interested events:', error);
      }
    };

    loadInterestedEvents();
  }, [currentUserId]);

  // Load all event sources and merge them
  const loadEvents = useCallback(async (pageNum: number = 0, append: boolean = false, refresh: boolean = false) => {
    if (refresh) {
      setPage(0);
      setHasMore(true);
      setEvents([]);
    }

    try {
      if (pageNum === 0 && !append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const limit = 20;
      const offset = pageNum * limit;

      // Convert FilterState to PreferencesV4FeedFilters if needed (for recommended events)
      let feedFilters: PreferencesV4FeedFilters | undefined;
      if (filters) {
        if ('genres' in filters && 'selectedCities' in filters) {
          // It's a FilterState
          const filterState = filters as any;
          const selectedCity = filterState.selectedCities && filterState.selectedCities.length > 0 
            ? filterState.selectedCities[0] 
            : undefined;
          
          if (selectedCity) {
            feedFilters = {
              city: selectedCity,
              genres: filterState.genres,
              dateRange: filterState.dateRange,
              includePast: false,
              maxDaysAhead: filterState.dateRange?.to 
                ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 90,
              radiusMiles: filterState.radiusMiles || 50,
            };
          } else if (filterState.latitude && filterState.longitude) {
            feedFilters = {
              latitude: filterState.latitude,
              longitude: filterState.longitude,
              genres: filterState.genres,
              dateRange: filterState.dateRange,
              includePast: false,
              maxDaysAhead: filterState.dateRange?.to 
                ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 90,
              radiusMiles: filterState.radiusMiles || 50,
            };
          } else {
            feedFilters = {
              genres: filterState.genres,
              dateRange: filterState.dateRange,
              includePast: false,
              maxDaysAhead: filterState.dateRange?.to 
                ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 90,
              radiusMiles: filterState.radiusMiles || 50,
            };
          }
        } else {
          // It's already PreferencesV4FeedFilters
          feedFilters = filters as PreferencesV4FeedFilters;
        }
      }

      // Extract city for trending events
      const cityForTrending = feedFilters?.city || filters?.city || filters?.selectedCities?.[0];

      // Load all event sources in parallel
      const [recommendedResult, trendingData, firstDegreeData, secondDegreeData, followingData] = await Promise.all([
        // Recommended events using PreferencesV4FeedService
        PreferencesV4FeedService.getFeed(currentUserId, limit, 0, feedFilters, false),
        // Trending events
        HomeFeedService.getTrendingEvents(
          currentUserId,
          undefined, // cityLat
          undefined, // cityLng  
          50, // radiusMiles
          limit,
          cityForTrending
        ),
        // First-degree friends interested events
        HomeFeedService.getFirstDegreeNetworkEvents(currentUserId, limit),
        // Second-degree friends interested events
        HomeFeedService.getSecondDegreeNetworkEvents(currentUserId, limit),
        // Following events (artists/venues)
        loadFollowingEventsHelper(currentUserId, limit, offset),
      ]);

      // Extract events from PreferencesV4FeedResult
      const recommendedData = recommendedResult.events || [];

      // Transform and merge all events
      const unifiedEvents: UnifiedEventItem[] = [];

      // Add recommended events
      recommendedData.forEach((event: PersonalizedEvent) => {
        unifiedEvents.push({
          event_id: event.id || '',
          title: event.title || event.artist_name || 'Event',
          artist_name: event.artist_name,
          venue_name: event.venue_name,
          venue_city: event.venue_city || undefined,
          event_date: event.event_date,
          image_url: event.image_url,
          poster_image_url: event.poster_image_url || undefined,
          images: event.images,
          event_media_url: event.event_media_url || event.poster_image_url || undefined,
          reason: 'recommended' as EventReason,
          interested_count: event.interested_count || 0,
          user_is_interested: event.user_is_interested || false,
        });
      });

      // Add trending events (avoid duplicates)
      const existingIds = new Set(unifiedEvents.map(e => e.event_id));
      trendingData.forEach((event) => {
        if (!existingIds.has(event.event_id)) {
          unifiedEvents.push({
            event_id: event.event_id,
            title: event.title,
            artist_name: event.artist_name,
            venue_name: event.venue_name,
            venue_city: event.venue_city || undefined,
            event_date: event.event_date,
            event_media_url: event.event_media_url,
            reason: 'trending' as EventReason,
            interested_count: 0,
          });
        }
      });

      // Add friends interested events (avoid duplicates)
      existingIds.clear();
      unifiedEvents.forEach(e => existingIds.add(e.event_id));
      [...firstDegreeData, ...secondDegreeData].forEach((event) => {
        if (!existingIds.has(event.event_id)) {
          unifiedEvents.push({
            event_id: event.event_id,
            title: event.title,
            artist_name: event.artist_name,
            venue_name: event.venue_name,
            venue_city: event.venue_city || undefined,
            event_date: event.event_date,
            images: event.images,
            event_media_url: event.event_media_url,
            reason: 'friend_interested' as EventReason,
            interested_count: event.interested_count || 0,
          });
        }
      });

      // Add following events (avoid duplicates)
      existingIds.clear();
      unifiedEvents.forEach(e => existingIds.add(e.event_id));
      followingData.forEach((event) => {
        if (!existingIds.has(event.event_id)) {
          unifiedEvents.push({
            event_id: event.event_id,
            title: event.title,
            artist_name: event.artist_name,
            venue_name: event.venue_name,
            venue_city: event.venue_city || undefined,
            event_date: event.event_date,
            images: event.images,
            event_media_url: event.event_media_url,
            reason: 'following' as EventReason,
            followed_artist_id: event.followed_artist_id,
            followed_venue_id: event.followed_venue_id,
            interested_count: 0,
          });
        }
      });

      // Filter to only show upcoming events (exclude past events)
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Set to start of today for more reliable date comparison
      const filteredUnifiedEvents = unifiedEvents.filter((event) => {
        if (!event.event_date) return false;
        const eventDate = new Date(event.event_date);
        eventDate.setHours(0, 0, 0, 0); // Normalize to start of day
        return eventDate >= now;
      });

      // Randomize order instead of sorting by date
      // Fisher-Yates shuffle algorithm
      for (let i = filteredUnifiedEvents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filteredUnifiedEvents[i], filteredUnifiedEvents[j]] = [filteredUnifiedEvents[j], filteredUnifiedEvents[i]];
      }

      // Update state
      if (append) {
        setEvents(prev => [...prev, ...filteredUnifiedEvents]);
      } else {
        setEvents(filteredUnifiedEvents);
      }

      // Check if there are more events
      setHasMore(filteredUnifiedEvents.length >= limit);
    } catch (error) {
      console.error('Error loading unified events:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentUserId, filters]);

  // Load following events (artists and venues) - helper function
  const loadFollowingEventsHelper = async (userId: string, limit: number, offset: number): Promise<UnifiedEventItem[]> => {
    try {
      // Get followed artist IDs
      const { data: artistFollows } = await supabase
        .from('artist_follows')
        .select('artist_id')
        .eq('user_id', userId);

      // Get followed venue IDs
      const { data: venueFollows } = await supabase
        .from('user_venue_relationships')
        .select('venue_id')
        .eq('user_id', userId);

      const artistIds = artistFollows?.map(af => af.artist_id) || [];
      const venueIds = venueFollows?.map(vf => vf.venue_id) || [];

      if (artistIds.length === 0 && venueIds.length === 0) {
        return [];
      }

      // Query events from followed artists and venues
      // Query events table directly with JOINs since view may be missing some columns
      let eventsQuery = supabase
        .from('events')
        .select('id, title, event_date, venue_city, images, event_media_url, media_urls, artist_id, artists(name), venue_id, venues(name)')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .range(offset, offset + limit - 1);

      if (artistIds.length > 0 && venueIds.length > 0) {
        eventsQuery = eventsQuery.or(`artist_id.in.(${artistIds.join(',')}),venue_id.in.(${venueIds.join(',')})`);
      } else if (artistIds.length > 0) {
        eventsQuery = eventsQuery.in('artist_id', artistIds);
      } else if (venueIds.length > 0) {
        eventsQuery = eventsQuery.in('venue_id', venueIds);
      }

      const { data: events, error } = await eventsQuery;

      if (error) {
        console.error('Error loading following events:', error);
        return [];
      }

      if (!events || events.length === 0) {
        return [];
      }

      // Transform to UnifiedEventItem format
      return events.map((event: any) => {
        // Extract image URL
        let imageUrl: string | undefined = undefined;
        if (event.event_media_url) {
          imageUrl = event.event_media_url;
        } else if (event.images && Array.isArray(event.images) && event.images.length > 0) {
          const bestImage = event.images.find((img: any) => 
            img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
          ) || event.images.find((img: any) => img?.url);
          imageUrl = bestImage?.url;
        } else if (event.media_urls && Array.isArray(event.media_urls) && event.media_urls.length > 0) {
          imageUrl = event.media_urls[0];
        }

        return {
          event_id: event.id,
          title: event.title || (event.artists?.name) || 'Event',
          artist_name: (event.artists?.name) || undefined,
          venue_name: (event.venues?.name) || undefined,
          venue_city: event.venue_city || undefined,
          event_date: event.event_date,
          images: event.images,
          event_media_url: imageUrl,
          reason: 'following' as EventReason,
          followed_artist_id: event.artist_id,
          followed_venue_id: event.venue_id,
          interested_count: 0,
        };
      });
    } catch (error) {
      console.error('Error loading following events:', error);
      return [];
    }
  };

  // Initial load
  useEffect(() => {
    loadEvents(0, false, true);
  }, [loadEvents]);

  // Handle interest toggle
  const handleInterestToggle = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyInterested = interestedEvents.has(eventId);
    const newInterestedState = !isCurrentlyInterested;

    try {
      await UserEventService.setEventInterest(currentUserId, eventId, newInterestedState);
      
      // Update local state
      setInterestedEvents(prev => {
        const next = new Set(prev);
        if (newInterestedState) {
          next.add(eventId);
        } else {
          next.delete(eventId);
        }
        return next;
      });

      // Update event in list
      setEvents(prev => prev.map(event => {
        if (event.event_id === eventId) {
          return {
            ...event,
            user_is_interested: newInterestedState,
            interested_count: (event.interested_count || 0) + (newInterestedState ? 1 : -1),
          };
        }
        return event;
      }));

      onInterestToggle?.(eventId, newInterestedState);
    } catch (error) {
      console.error('Error toggling interest:', error);
    }
  };

  // Infinite scroll and pull-to-refresh
  useEffect(() => {
    const feedElement = feedRef.current;
    if (!feedElement) return;

    let touchStartY = 0;
    let pullToRefreshThreshold = 80;
    let isPullingToRefresh = false;
    let pullDistance = 0;

    const handleScroll = () => {
      const scrollHeight = feedElement.scrollHeight;
      const clientHeight = feedElement.clientHeight;
      const scrollTop = feedElement.scrollTop;

      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore && !loading) {
        const nextPage = page + 1;
        setPage(nextPage);
        loadEvents(nextPage, true);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      pullDistance = 0;
      isPullingToRefresh = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;

      if (feedElement.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        pullDistance = deltaY;
        isPullingToRefresh = true;

        if (pullDistance > pullToRefreshThreshold) {
          feedElement.style.transform = `translateY(${Math.min(pullDistance, 120)}px)`;
        } else {
          feedElement.style.transform = `translateY(${pullDistance}px)`;
        }
      }
    };

    const handleTouchEnd = () => {
      if (isPullingToRefresh && pullDistance > pullToRefreshThreshold) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
        loadEvents(0, false, true);
      } else if (isPullingToRefresh) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
      }

      isPullingToRefresh = false;
      pullDistance = 0;
    };

    feedElement.addEventListener('scroll', handleScroll, { passive: true });
    feedElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    feedElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    feedElement.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      feedElement.removeEventListener('scroll', handleScroll);
      feedElement.removeEventListener('touchend', handleTouchEnd);
      feedElement.removeEventListener('touchstart', handleTouchStart);
      feedElement.removeEventListener('touchmove', handleTouchMove);
    };
  }, [hasMore, loadingMore, loading, page, loadEvents]);

  // Extract image URL helper
  const getImageUrl = (event: UnifiedEventItem): string | undefined => {
    if (event.event_media_url) {
      return replaceJambasePlaceholder(event.event_media_url);
    } else if (event.images && Array.isArray(event.images) && event.images.length > 0) {
      const bestImage = event.images.find((img: any) => 
        img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
      ) || event.images.find((img: any) => img?.url);
      return bestImage?.url ? replaceJambasePlaceholder(bestImage.url) : undefined;
    } else if (event.image_url) {
      return replaceJambasePlaceholder(event.image_url);
    } else if (event.poster_image_url) {
      return replaceJambasePlaceholder(event.poster_image_url);
    }
    return undefined;
  };

  if (loading && events.length === 0) {
    return (
      <div className="swift-ui-feed-container">
        <SynthLoadingInline text="Loading events..." size="md" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="swift-ui-feed-container flex items-center justify-center">
        <div className="text-center py-12 px-4">
          <p className="text-lg font-semibold text-neutral-900 mb-2">No events found</p>
          <p className="text-sm text-neutral-600">Try adjusting your filters or check back later</p>
        </div>
      </div>
    );
  }

  return (
    <div className="swift-ui-feed-container">
      <div className="swift-ui-feed" ref={feedRef}>
        {events.map((event, index) => {
          const imageUrl = getImageUrl(event);
          const isInterested = interestedEvents.has(event.event_id) || event.user_is_interested || false;
          const interestedCount = (event.interested_count || 0) + (isInterested ? 1 : 0);

          return (
            <div key={`${event.event_id}-${index}`} className="swift-ui-feed-item">
              <CompactEventCard
                event={{
                  id: event.event_id,
                  title: event.title,
                  artist_name: event.artist_name,
                  venue_name: event.venue_name,
                  event_date: event.event_date,
                  venue_city: event.venue_city,
                  image_url: imageUrl,
                  poster_image_url: event.poster_image_url,
                }}
                reason={event.reason}
                interestedCount={interestedCount}
                isInterested={isInterested}
                onInterestClick={(e) => handleInterestToggle(event.event_id, e)}
                onShareClick={(e) => onShareClick?.(event, e)}
                onClick={() => onEventClick?.(event.event_id)}
              />
            </div>
          );
        })}
        {loadingMore && (
          <div className="flex justify-center py-8">
            <SynthLoader variant="spinner" size="sm" />
          </div>
        )}
      </div>
    </div>
  );
};
