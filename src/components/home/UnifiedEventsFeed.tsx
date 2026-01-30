import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PersonalizationEngineV5, type PersonalizedEvent } from '@/services/personalizedFeedService';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import { CompactEventCard, type EventReason } from './CompactEventCard';
import { SynthLoadingInline, SynthLoader } from '@/components/ui/SynthLoader';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import type { PersonalizedFeedFilters } from '@/services/personalizedFeedService';
import { useIntersectionTrackingList } from '@/hooks/useIntersectionTracking';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';
// import { useViewportHeight } from '@/hooks/useViewportHeight';
import { LocationService } from '@/services/locationService';

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
}

interface UnifiedEventsFeedProps {
  currentUserId: string;
  filters?: PersonalizedFeedFilters | { selectedCities?: string[]; city?: string; genres?: string[]; dateRange?: { from?: Date; to?: Date }; radiusMiles?: number; latitude?: number; longitude?: number };
  onEventClick?: (eventId: string) => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onShareClick?: (event: UnifiedEventItem, e: React.MouseEvent) => void;
}

const PAGE_SIZE = 20;
const BATCH_SIZE = 100; // Pre-fetch 100 events at once
const PREFETCH_THRESHOLD = 60; // Start prefetching when 60 events are displayed (3rd load more)

function personalEventToItem(event: PersonalizedEvent, eventType?: string): UnifiedEventItem {
  // Map event_type from context to reason
  const reason: EventReason = eventType === 'following' ? 'following' 
    : eventType === 'recommending' ? 'recommended' 
    : 'trending';
  
  return {
    event_id: event.id || '',
    title: event.title || event.artist_name || 'Event',
    artist_name: event.artist_name ?? undefined,
    venue_name: event.venue_name ?? undefined,
    venue_city: event.venue_city ?? undefined,
    event_date: event.event_date,
    poster_image_url: event.poster_image_url ?? undefined,
    images: event.images,
    event_media_url: event.event_media_url ?? event.poster_image_url ?? undefined,
    reason,
    interested_count: event.interested_count ?? 0,
    user_is_interested: event.user_is_interested ?? false,
  };
}

export const UnifiedEventsFeed: React.FC<UnifiedEventsFeedProps> = ({
  currentUserId,
  filters,
  onEventClick,
  onInterestToggle,
  onShareClick,
}) => {
  // All fetched events (batch of 100) and displayed events (paginated from batch)
  const [allFetchedEvents, setAllFetchedEvents] = useState<UnifiedEventItem[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<UnifiedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [apiOffset, setApiOffset] = useState(0); // Offset for API calls
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE); // How many to show
  const [hasMoreFromApi, setHasMoreFromApi] = useState(true); // More from server
  const feedRef = useRef<HTMLDivElement>(null);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  
  // Background prefetching state
  const isPrefetchingRef = useRef(false);
  const prefetchedEventsRef = useRef<UnifiedEventItem[]>([]);
  const prefetchedOffsetRef = useRef<number>(0);
  
  // Ref for refresh function to avoid stale closures in touch handlers
  const refreshFnRef = useRef<() => Promise<void>>();
  const isRefreshingRef = useRef(false);
  
  // Track if initial load has completed to prevent re-fetching on filter changes
  const initialLoadCompleteRef = useRef(false);
  
  // User location and preferences
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userTopGenres, setUserTopGenres] = useState<string[]>([]);
  const locationFetchedRef = useRef(false);

  const attachObserver = useIntersectionTrackingList(
    'event',
    displayedEvents.map((e, idx) => ({
      id: e.event_id,
      metadata: { ...getEventMetadata(e), source: 'feed', position: idx },
    }))
  );

  // Compute whether we have more events to show (locally or from API)
  const hasMore = displayCount < allFetchedEvents.length || hasMoreFromApi;

  // Fetch user location and top_genres on mount, then load feed
  useEffect(() => {
    if (locationFetchedRef.current) return;
    locationFetchedRef.current = true;

    const initFeed = async () => {
      // Fetch location and preferences in parallel
      const [locationResult, prefsResult] = await Promise.allSettled([
        LocationService.getCurrentLocation(),
        supabase
          .from('user_preferences')
          .select('top_genres')
          .eq('user_id', currentUserId)
          .single()
      ]);

      let loc: { lat: number; lng: number } | null = null;
      let genres: string[] = [];

      if (locationResult.status === 'fulfilled') {
        loc = { lat: locationResult.value.latitude, lng: locationResult.value.longitude };
        console.log('📍 [UnifiedEventsFeed] Got user location:', loc);
        setUserLocation(loc);
      } else {
        console.log('📍 [UnifiedEventsFeed] Could not get location:', locationResult.reason?.message);
      }

      if (prefsResult.status === 'fulfilled' && prefsResult.value.data?.top_genres) {
        genres = prefsResult.value.data.top_genres;
        console.log('🎵 [UnifiedEventsFeed] Got user top_genres:', genres);
        setUserTopGenres(genres);
      }

      // Now load the feed WITH the location
      if (!initialLoadCompleteRef.current) {
        initialLoadCompleteRef.current = true;
        console.log('🎯 [UnifiedEventsFeed] Loading feed with location:', loc);
        
        setLoading(true);
        try {
          const f = filters as any;
          const dateTo = f?.dateRange?.to;
          const maxDaysAhead = dateTo ? Math.ceil((dateTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 90;
          
          const feedFilters: PersonalizedFeedFilters = {
            latitude: f?.latitude ?? loc?.lat,
            longitude: f?.longitude ?? loc?.lng,
            genres: (f?.genres && f.genres.length > 0) ? f.genres : genres,
            dateRange: f?.dateRange,
            radiusMiles: f?.radiusMiles ?? 50,
            selectedCities: f?.selectedCities,
            includePast: false,
            maxDaysAhead,
          };
          
          console.log('🎯 [UnifiedEventsFeed] Feed filters:', feedFilters);
          
          const result = await PersonalizationEngineV5.getUnifiedFeed(currentUserId, BATCH_SIZE, 0, feedFilters);
          const items = result.events.map(e => personalEventToItem(e, (e as any).event_type));
          
          setAllFetchedEvents(items);
          setDisplayedEvents(items.slice(0, PAGE_SIZE));
          setHasMoreFromApi(result.hasMore);
          setApiOffset(items.length);
          console.log('🎯 [UnifiedEventsFeed] Loaded', items.length, 'events');
        } catch (error) {
          console.error('Error loading feed:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    initFeed();
  }, [currentUserId, filters]);

  const toFeedFilters = useCallback((): PersonalizedFeedFilters | undefined => {
    const f = filters as any;
    const dateTo = f?.dateRange?.to;
    const maxDaysAhead = dateTo ? Math.ceil((dateTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 90;
    
    const effectiveLat = f?.latitude ?? userLocation?.lat;
    const effectiveLng = f?.longitude ?? userLocation?.lng;
    const effectiveGenres = (f?.genres && f.genres.length > 0) ? f.genres : userTopGenres;
    
    return {
      latitude: effectiveLat,
      longitude: effectiveLng,
      genres: effectiveGenres,
      dateRange: f?.dateRange,
      radiusMiles: f?.radiusMiles ?? 50,
      selectedCities: f?.selectedCities,
      includePast: false,
      maxDaysAhead,
    };
  }, [filters, userLocation, userTopGenres]);

  // Fetch a batch of 100 events from the API
  const fetchBatch = useCallback(async (offset: number): Promise<{ events: UnifiedEventItem[]; hasMore: boolean }> => {
    const feedFilters = toFeedFilters();
    console.log('🎯 [UnifiedEventsFeed] fetchBatch offset:', offset, 'filters:', feedFilters);
    
    const result = await PersonalizationEngineV5.getUnifiedFeed(currentUserId, BATCH_SIZE, offset, feedFilters);
    console.log('🎯 [UnifiedEventsFeed] fetchBatch result:', result.events.length, 'events, hasMore:', result.hasMore);
    
    const items = result.events.map(e => personalEventToItem(e, (e as any).event_type));
    return { events: items, hasMore: result.hasMore };
  }, [currentUserId, toFeedFilters]);

  // Background prefetch function - fetches next batch silently
  const prefetchNextBatch = useCallback(async (currentApiOffset: number) => {
    if (isPrefetchingRef.current || !hasMoreFromApi) return;
    
    isPrefetchingRef.current = true;
    console.log('🔄 [UnifiedEventsFeed] Background prefetch starting at offset:', currentApiOffset);
    
    try {
      const { events: newEvents, hasMore } = await fetchBatch(currentApiOffset);
      prefetchedEventsRef.current = newEvents;
      prefetchedOffsetRef.current = currentApiOffset;
      console.log('✅ [UnifiedEventsFeed] Background prefetch complete:', newEvents.length, 'events ready');
      
      // Update hasMoreFromApi based on prefetch result
      if (!hasMore) {
        setHasMoreFromApi(false);
      }
    } catch (error) {
      console.error('Background prefetch error:', error);
    } finally {
      isPrefetchingRef.current = false;
    }
  }, [fetchBatch, hasMoreFromApi]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setApiOffset(0);
    setDisplayCount(PAGE_SIZE);
    // Clear prefetch cache on fresh load
    prefetchedEventsRef.current = [];
    prefetchedOffsetRef.current = 0;
    isPrefetchingRef.current = false;
    
    try {
      const { events, hasMore } = await fetchBatch(0);
      setAllFetchedEvents(events);
      setDisplayedEvents(events.slice(0, PAGE_SIZE));
      setHasMoreFromApi(hasMore);
      setApiOffset(events.length);
      console.log('🎯 [UnifiedEventsFeed] loadInitial: showing', PAGE_SIZE, 'of', events.length, 'fetched');
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchBatch]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    
    const nextDisplayCount = displayCount + PAGE_SIZE;
    
    // If we have enough in local buffer, just show more
    if (nextDisplayCount <= allFetchedEvents.length) {
      console.log('🎯 [UnifiedEventsFeed] loadMore (local): showing', nextDisplayCount, 'of', allFetchedEvents.length);
      setDisplayedEvents(allFetchedEvents.slice(0, nextDisplayCount));
      setDisplayCount(nextDisplayCount);
      return;
    }
    
    // Check if we have prefetched events ready to use
    if (prefetchedEventsRef.current.length > 0 && prefetchedOffsetRef.current === apiOffset) {
      console.log('⚡ [UnifiedEventsFeed] Using prefetched events:', prefetchedEventsRef.current.length);
      const combined = [...allFetchedEvents, ...prefetchedEventsRef.current];
      setAllFetchedEvents(combined);
      setDisplayedEvents(combined.slice(0, nextDisplayCount));
      setDisplayCount(nextDisplayCount);
      setApiOffset(prev => prev + prefetchedEventsRef.current.length);
      // Clear prefetch cache after using
      prefetchedEventsRef.current = [];
      prefetchedOffsetRef.current = 0;
      return;
    }
    
    // Need to fetch more from API
    if (!hasMoreFromApi) {
      // No more from API, just show what we have
      setDisplayedEvents(allFetchedEvents);
      setDisplayCount(allFetchedEvents.length);
      return;
    }
    
    setLoadingMore(true);
    try {
      const { events: newEvents, hasMore } = await fetchBatch(apiOffset);
      const combined = [...allFetchedEvents, ...newEvents];
      setAllFetchedEvents(combined);
      setDisplayedEvents(combined.slice(0, nextDisplayCount));
      setDisplayCount(nextDisplayCount);
      setHasMoreFromApi(hasMore);
      setApiOffset(prev => prev + newEvents.length);
      console.log('🎯 [UnifiedEventsFeed] loadMore (API): showing', nextDisplayCount, 'of', combined.length);
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, displayCount, allFetchedEvents, hasMoreFromApi, apiOffset, fetchBatch]);

  // Background prefetch when approaching end of current batch
  useEffect(() => {
    // When displayed events reach threshold and we have more from API, prefetch next batch
    const remainingInBuffer = allFetchedEvents.length - displayCount;
    const shouldPrefetch = displayCount >= PREFETCH_THRESHOLD && 
                           remainingInBuffer <= PAGE_SIZE * 2 && 
                           hasMoreFromApi && 
                           !isPrefetchingRef.current &&
                           prefetchedEventsRef.current.length === 0;
    
    if (shouldPrefetch) {
      console.log('🔄 [UnifiedEventsFeed] Triggering background prefetch (displayed:', displayCount, ', remaining:', remainingInBuffer, ')');
      prefetchNextBatch(apiOffset);
    }
  }, [displayCount, allFetchedEvents.length, hasMoreFromApi, apiOffset, prefetchNextBatch]);

  // Load interested events
  useEffect(() => {
    supabase
      .from('user_event_relationships')
      .select('event_id')
      .eq('user_id', currentUserId)
      .eq('relationship_type', 'interested')
      .then(({ data }) => {
        if (data) setInterestedEvents(new Set(data.map(r => r.event_id)));
      })
      .catch(() => {});
  }, [currentUserId]);

  // Initial load is now handled in the location fetch effect above

  // Refresh function with visual feedback - update ref whenever loadInitial changes
  useEffect(() => {
    refreshFnRef.current = async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      console.log('🔄 [UnifiedEventsFeed] Pull to refresh triggered - using latest filters');
      try {
        // Reset state for fresh load
        setLoading(true);
        setApiOffset(0);
        setDisplayCount(PAGE_SIZE);
        prefetchedEventsRef.current = [];
        prefetchedOffsetRef.current = 0;
        isPrefetchingRef.current = false;
        
        // Fetch with current filters (including updated location/genres)
        const feedFilters = toFeedFilters();
        console.log('🔄 [UnifiedEventsFeed] Refresh filters:', feedFilters);
        
        const result = await PersonalizationEngineV5.getUnifiedFeed(currentUserId, BATCH_SIZE, 0, feedFilters);
        const items = result.events.map(e => personalEventToItem(e, (e as any).event_type));
        
        setAllFetchedEvents(items);
        setDisplayedEvents(items.slice(0, PAGE_SIZE));
        setHasMoreFromApi(result.hasMore);
        setApiOffset(items.length);
        setLoading(false);
        
        console.log('✅ [UnifiedEventsFeed] Refresh complete:', items.length, 'events');
      } catch (error) {
        console.error('Error refreshing feed:', error);
        setLoading(false);
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        setPullDistance(0);
      }
    };
  }, [currentUserId, toFeedFilters]);

  // Pull to refresh - only set up once, uses refs to get latest values
  useEffect(() => {
    const feedElement = feedRef.current;
    if (!feedElement) return;

    let touchStartY = 0;
    let currentPullDistance = 0;
    const pullToRefreshThreshold = 80;
    let isAtTop = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Check if we're at the top of the scroll
      isAtTop = feedElement.scrollTop <= 0;
      touchStartY = e.touches[0].clientY;
      currentPullDistance = 0;
      // Clear any previous transition
      feedElement.style.transition = '';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isAtTop || isRefreshingRef.current) return;
      
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;
      
      // Only activate when scrolled to top and pulling down
      if (feedElement.scrollTop <= 0 && deltaY > 0) {
        e.preventDefault();
        // Apply resistance (pull further = less movement)
        currentPullDistance = Math.min(deltaY * 0.5, 120);
        setPullDistance(currentPullDistance);
        feedElement.style.transform = `translateY(${currentPullDistance}px)`;
      }
    };

    const handleTouchEnd = () => {
      if (!isAtTop) return;
      
      feedElement.style.transition = 'transform 0.3s ease-out';
      feedElement.style.transform = '';
      
      if (currentPullDistance >= pullToRefreshThreshold && !isRefreshingRef.current) {
        refreshFnRef.current?.();
      } else {
        setPullDistance(0);
      }
      currentPullDistance = 0;
      
      // Clear transition after animation
      setTimeout(() => {
        if (feedElement) {
          feedElement.style.transition = '';
        }
      }, 300);
    };

    feedElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    feedElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    feedElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      feedElement.removeEventListener('touchstart', handleTouchStart);
      feedElement.removeEventListener('touchmove', handleTouchMove);
      feedElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, []); // Empty deps - only run once, uses refs for latest values

  const findEvent = useCallback((eventId: string): UnifiedEventItem | null => {
    return allFetchedEvents.find(e => e.event_id === eventId) ?? null;
  }, [allFetchedEvents]);

  const handleInterestToggle = async (eventId: string, e: React.MouseEvent) => {
    const event = findEvent(eventId);
    if (event) {
      try {
        const eventUuid = getEventUuid(event);
        const { trackInteraction } = await import('@/services/interactionTrackingService');
        trackInteraction.interest(
          'event',
          eventId,
          !interestedEvents.has(eventId),
          { ...getEventMetadata(event), source: 'feed' },
          eventUuid || undefined
        );
      } catch (err) {
        console.error('Error tracking interest toggle:', err);
      }
    }
    e.stopPropagation();
    const isCurrentlyInterested = interestedEvents.has(eventId);
    const newInterestedState = !isCurrentlyInterested;

    try {
      await UserEventService.setEventInterest(currentUserId, eventId, newInterestedState);
      setInterestedEvents(prev => {
        const next = new Set(prev);
        if (newInterestedState) next.add(eventId);
        else next.delete(eventId);
        return next;
      });

      const updateEvent = (ev: UnifiedEventItem) =>
        ev.event_id === eventId
          ? { ...ev, user_is_interested: newInterestedState, interested_count: (ev.interested_count || 0) + (newInterestedState ? 1 : -1) }
          : ev;
      setAllFetchedEvents(prev => prev.map(updateEvent));
      setDisplayedEvents(prev => prev.map(updateEvent));

      onInterestToggle?.(eventId, newInterestedState);
    } catch (error) {
      console.error('Error toggling interest:', error);
    }
  };

  const getImageUrl = (event: UnifiedEventItem): string | undefined => {
    if (event.event_media_url) return replaceJambasePlaceholder(event.event_media_url);
    if (event.images && Array.isArray(event.images) && event.images.length > 0) {
      const bestImage = event.images.find((img: any) => img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000)))
        || event.images.find((img: any) => img?.url);
      return bestImage?.url ? replaceJambasePlaceholder(bestImage.url) : undefined;
    }
    if (event.poster_image_url) return replaceJambasePlaceholder(event.poster_image_url);
    return undefined;
  };

  if (loading && displayedEvents.length === 0) {
    return (
      <div className="swift-ui-feed-container">
        <SynthLoadingInline text="Loading events..." size="md" />
      </div>
    );
  }

  if (displayedEvents.length === 0 && !hasMore) {
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
    <div className="swift-ui-feed-container h-full relative">
      {/* Pull to refresh indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center pointer-events-none z-10 transition-opacity duration-200"
        style={{
          height: '60px',
          opacity: pullDistance > 20 || isRefreshing ? 1 : 0,
          transform: `translateY(${Math.min(pullDistance - 60, 0)}px)`,
        }}
      >
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
          {isRefreshing ? (
            <>
              <SynthLoader variant="spinner" size="sm" />
              <span className="text-sm font-medium text-neutral-700">Refreshing...</span>
            </>
          ) : pullDistance >= 80 ? (
            <>
              <svg className="w-4 h-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-pink-500">Release to refresh</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-sm font-medium text-neutral-500">Pull down to refresh</span>
            </>
          )}
        </div>
      </div>
      
      <div
        className="swift-ui-feed h-full"
        ref={feedRef}
        style={{
          paddingTop: '12px',
          paddingBottom: '80px', // Extra padding for load more button
          overflowY: 'auto',
        }}
      >
        <div className="space-y-3 px-2">
          {displayedEvents.map((event, index) => {
            const imageUrl = getImageUrl(event);
            const isInterested = interestedEvents.has(event.event_id) || event.user_is_interested || false;
            const interestedCount = event.interested_count || 0;
            return (
              <div
                key={`${event.event_id}-${index}`}
                className="swift-ui-feed-item"
                ref={(el) => attachObserver(el, event.event_id)}
              >
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
        </div>
        
        {/* Load More Button - SwiftUI Glassmorphism Style with Synth Pink */}
        {/* Always show the button - users can try to load more even if we think we're done */}
        <div className="flex justify-center py-6 px-4">
            <button
              type="button"
              disabled={loadingMore}
              onClick={hasMore ? loadMore : loadInitial}
              className="
                relative overflow-hidden
                px-8 py-3 rounded-2xl
                font-semibold text-sm
                text-white
                transition-all duration-300 ease-out
                hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed
              "
              style={{
                background: 'linear-gradient(135deg, #FF3399 0%, #FF66B3 50%, #FF99CC 100%)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 8px 32px rgba(255,51,153,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              {/* Glass highlight overlay */}
              <span 
                className="absolute inset-0 opacity-30"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
                  borderRadius: 'inherit',
                }}
              />
              {/* Content */}
              <span className="relative z-10 flex items-center gap-2">
                {loadingMore ? (
                  <>
                    <SynthLoader variant="spinner" size="sm" />
                    <span>Loading...</span>
                  </>
                ) : !hasMore ? (
                  <>
                    <span>Refresh Feed</span>
                    <svg 
                      className="w-4 h-4" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                      />
                    </svg>
                  </>
                ) : (
                  <>
                    <span>Load More</span>
                    <svg 
                      className="w-4 h-4" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M19 9l-7 7-7-7" 
                      />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </div>
      </div>
    </div>
  );
};
