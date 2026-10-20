import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { hapticLight } from '@/utils/haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PersonalizationEngineV5, type PersonalizedEvent } from '@/services/personalizedFeedService';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import type { EventReason } from './CompactEventCard';
import { ThreadEventCard, type CardRatings } from './thread/ThreadEventCard';
import { findPick5Band } from './thread/pick5';
import { useReviewHighlights } from './thread/useReviewHighlights';
import { ArtistExclusionService } from '@/services/artistExclusionService';
import { ToastAction } from '@/components/ui/toast';
import './thread/thread.css';
import { Button } from '@/components/ui/button';
import { SynthLoadingInline, SynthLoader } from '@/components/ui/SynthLoader';
import { resolveEventCardImageUrl } from '@/utils/eventImageFallbacks';
import type { PersonalizedFeedFilters } from '@/services/personalizedFeedService';
import { useIntersectionTrackingList } from '@/hooks/useIntersectionTracking';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';
import { VerifiedChatService } from '@/services/verifiedChatService';
import { getUserArtistAffinity, boostEventsByArtistAffinity } from '@/services/artistAffinityService';
import { BucketListService } from '@/services/bucketListService';
import {
  getEventsFromRankedArtists,
  weaveBucketListIntoFeed,
  BUCKET_LIST_TOP_LIMIT,
  JUST_ANNOUNCED_LABEL,
  logJustAnnounced,
  planNaturalWeave,
  dailySeed,
  reviewEventMatch,
  type ReviewMatch,
} from '@synth/shared';
import { toast } from '@/hooks/use-toast';
// import { useViewportHeight } from '@/hooks/useViewportHeight';
import { LocationService } from '@/services/locationService';
import { getLastKnownLocation, saveLastKnownLocation } from '@/services/locationCacheService';
import { isEventUpcomingForFeed } from '@/utils/localYmd';

interface UnifiedEventItem {
  event_id: string;
  title: string;
  artist_id?: string;
  artist_name?: string;
  venue_id?: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  event_date: string;
  image_url?: string;
  poster_image_url?: string;
  images?: any;
  event_media_url?: string;
  ticket_urls?: string[];
  reason: EventReason;
  /** Badge text override, e.g. "#1 on your bucket list". */
  reasonLabel?: string;
  interested_count?: number;
  friends_interested_count?: number;
  user_is_interested?: boolean;
  /** Just-announced show by an artist the viewer follows / has bucket-listed. */
  is_fan?: boolean;
  /** Pinned to the top by get_personalized_feed_v5 (context.just_announced). */
  just_announced?: boolean;
  distance_miles?: number | null;
}

/** Non-event stop on the thread (e.g. a friend's review). */
export interface ThreadNode {
  key: string;
  /** Gets the side of the show it sits after (artist / venue), or null when unrelated. */
  render: (match: ReviewMatch | null) => React.ReactNode;
  /** Lets the card sit right after a show by the same artist / at the same venue. */
  artistId?: string | null;
  venueId?: string | null;
  /** A venue-only pairing needs venue text (see reviewEventMatch). */
  venueFeedback?: string | null;
}

type ThreadEntry =
  | { kind: 'event'; item: UnifiedEventItem }
  | { kind: 'review'; key: string; node: React.ReactNode }
  | { kind: 'section'; node: React.ReactNode };

// Natural spacing for non-ranked cards (naturalWeave in @synth/shared): gaps vary inside
// these ranges instead of a fixed every-Nth slot. Pick5 shows only arrive through the
// ranker's groups (Trending gives Pick5 artists a lift server-side).
const REVIEW_WEAVE = { firstAt: 4, minGap: 5, maxGap: 9 };
const FRIEND_EVENT_WEAVE = { firstAt: 3, minGap: 4, maxGap: 7 };
const BUCKET_SPACING = 4;

/** Shows the RPC pinned (new shows from the user's own artists) stay on top after client re-ranking. */
const keepPinnedFirst = (items: UnifiedEventItem[]) => [
  ...items.filter((e) => e.just_announced),
  ...items.filter((e) => !e.just_announced),
];

const formatDistance = (miles?: number | null) =>
  miles == null ? undefined : miles < 10 ? 'Near you' : `${Math.round(miles).toLocaleString()} mi away`;

interface UnifiedEventsFeedProps {
  currentUserId: string;
  filters?: PersonalizedFeedFilters | { selectedCities?: string[]; city?: string; genres?: string[]; dateRange?: { from?: Date; to?: Date }; radiusMiles?: number; latitude?: number; longitude?: number };
  onEventClick?: (eventId: string) => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onShareClick?: (event: UnifiedEventItem, e: React.MouseEvent) => void;
  /** Insert this ReactNode after N events (e.g. friend suggestions rail after 3 events) */
  insertSectionAfterIndex?: number;
  middleSection?: React.ReactNode;
  /** Friends' reviews woven between events */
  reviewNodes?: ThreadNode[];
  /** Extra events to inject into the feed (e.g. friend-interested events labeled FRIENDS) */
  extraEvents?: UnifiedEventItem[];
  /** True while the parent is still fetching reviewNodes/extraEvents; the first paint waits for them */
  extrasLoading?: boolean;
}

const PAGE_SIZE = 20;
const INITIAL_FEED_SIZE = 20; // First load: fewer events for faster first paint
const BATCH_SIZE = 100; // Load-more batches
const PREFETCH_THRESHOLD = 60; // Start prefetching when 60 events are displayed (3rd load more)
const LOCATION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOCATION_RELOAD_THRESHOLD_MILES = 50; // Only reload when location changes meaningfully

function filterUpcomingFeedItems(items: UnifiedEventItem[]): UnifiedEventItem[] {
  return items.filter((item) => isEventUpcomingForFeed(item.event_date));
}


/**
 * Upcoming nearby events for the user's top-ranked bucket-list artists, #1 first.
 *
 * Labelled 'recommended', not with a bucket badge: the bucket list is meant to inform what
 * gets recommended, not to be its own shelf. It still needs a separate fetch because the
 * feed RPC samples candidates and a #1-ranked artist playing nearby is not guaranteed to
 * be sampled — the bucket-list preference signals raise its score, but only among
 * candidates that were picked in the first place.
 */
async function fetchBucketListTopEvents(
  userId: string,
  loc: { lat: number; lng: number } | null,
  radiusMiles?: number
): Promise<UnifiedEventItem[]> {
  try {
    // getBucketList already returns rank_order asc (nulls last), then added_at asc.
    const bucketList = await BucketListService.getBucketList(userId);
    const rankedArtists = bucketList
      .filter((item) => item.entity_type === 'artist' && !!item.entity_id)
      .map((item) => ({ id: item.entity_id, name: item.entity_name }));

    const events = await getEventsFromRankedArtists(supabase, rankedArtists, {
      limit: BUCKET_LIST_TOP_LIMIT,
      near: loc ? { lat: loc.lat, lng: loc.lng, radiusMiles } : undefined,
    });

    return events.map((e: any) => ({
      event_id: String(e.id),
      title: e.title || e.artist_name || 'Event',
      artist_id: e.artist_id ?? undefined,
      artist_name: e.artist_name || undefined,
      venue_id: e.venue_id ?? undefined,
      venue_name: e.venue_name || undefined,
      venue_city: e.venue_city || undefined,
      venue_state: e.venue_state || undefined,
      event_date: String(e.event_date),
      images: e.images,
      event_media_url: e.event_media_url ?? undefined,
      reason: 'recommended' as EventReason,
      interested_count: 0,
      friends_interested_count: 0,
      user_is_interested: false,
    }));
  } catch (error) {
    console.error('Error loading bucket list events for feed:', error);
    return [];
  }
}

/** Later pages can return shows already woven/pinned into page 1 (bucket list, just announced). */
const appendUnique = (existing: UnifiedEventItem[], next: UnifiedEventItem[]) => {
  const seen = new Set(existing.map((e) => e.event_id));
  return [...existing, ...next.filter((e) => !seen.has(e.event_id))];
};

/** Fetch feed for the filter location (the user's browse pick), else the device location */
async function fetchFeedForLocations(
  userId: string,
  baseFilters: Omit<PersonalizedFeedFilters, 'latitude' | 'longitude'>,
  filterLoc: { lat: number; lng: number } | null,
  userLoc: { lat: number; lng: number } | null,
  limit: number
): Promise<{ events: UnifiedEventItem[]; hasMore: boolean }> {
  // Never mix in GPS results when a filter location is set: a picked city must
  // not be diluted with events from wherever the device happens to be.
  const locs: { lat: number; lng: number }[] = [];
  if (filterLoc) locs.push(filterLoc);
  else if (userLoc) locs.push(userLoc);

  const [affinity, bucketTop] = await Promise.all([
    getUserArtistAffinity(userId),
    fetchBucketListTopEvents(userId, locs[0] ?? null, baseFilters.radiusMiles),
  ]);
  const bucketSeed = dailySeed(`${userId}:bucket`);

  if (locs.length === 0) {
    const result = await PersonalizationEngineV5.getUnifiedFeed(userId, limit, 0, baseFilters);
    const boosted = boostEventsByArtistAffinity(result.events, affinity);
    return {
      events: weaveBucketListIntoFeed(
        keepPinnedFirst(filterUpcomingFeedItems(boosted.map((e) => personalEventToItem(e, (e as any).event_type)))),
        bucketTop,
        (e) => e.event_id,
        BUCKET_SPACING,
        bucketSeed
      ),
      hasMore: result.hasMore,
    };
  }

  const results = await Promise.all(
    locs.map(({ lat, lng }) =>
      PersonalizationEngineV5.getUnifiedFeed(userId, limit, 0, { ...baseFilters, latitude: lat, longitude: lng })
    )
  );

  const seen = new Set<string>();
  const mergedEvents: typeof results[number]['events'] = [];
  for (const r of results) {
    for (const e of r.events) {
      if (!seen.has(e.id || '')) {
        seen.add(e.id || '');
        mergedEvents.push(e);
      }
    }
  }
  const boostedMerged = boostEventsByArtistAffinity(mergedEvents, affinity);
  const merged = boostedMerged.map(e => personalEventToItem(e, (e as any).event_type));
  const hasMore = results.some(r => r.hasMore) || merged.length >= limit;
  return {
    events: weaveBucketListIntoFeed(
      keepPinnedFirst(filterUpcomingFeedItems(merged)),
      bucketTop,
      (e) => e.event_id,
      BUCKET_SPACING,
      bucketSeed
    ),
    hasMore,
  };
}

function personalEventToItem(event: PersonalizedEvent, eventType?: string): UnifiedEventItem {
  // Map event_type from context to reason
  const reason: EventReason = eventType === 'following' ? 'following' 
    : eventType === 'recommending' ? 'recommended' 
    : 'trending';
  
  return {
    event_id: event.id || '',
    title: event.title || event.artist_name || 'Event',
    artist_id: event.artist_id ?? undefined,
    artist_name: event.artist_name ?? undefined,
    venue_id: event.venue_id ?? undefined,
    venue_name: event.venue_name ?? undefined,
    venue_city: event.venue_city ?? undefined,
    venue_state: event.venue_state ?? undefined,
    event_date: event.event_date,
    poster_image_url: event.poster_image_url ?? undefined,
    images: event.images,
    event_media_url: event.event_media_url ?? event.poster_image_url ?? undefined,
    ticket_urls: Array.isArray(event.ticket_urls) ? event.ticket_urls : undefined,
    reason,
    ...(event.just_announced
      ? { just_announced: true, is_fan: true, reasonLabel: JUST_ANNOUNCED_LABEL }
      : {}),
    interested_count: event.interested_count ?? 0,
    friends_interested_count: event.friends_interested_count ?? 0,
    user_is_interested: event.user_is_interested ?? false,
  };
}

export const UnifiedEventsFeed: React.FC<UnifiedEventsFeedProps> = ({
  currentUserId,
  filters,
  onEventClick,
  onInterestToggle,
  onShareClick,
  insertSectionAfterIndex,
  middleSection,
  reviewNodes,
  extraEvents,
  extrasLoading = false,
}) => {
  const queryClient = useQueryClient();

  // All fetched events (batch of 100) and displayed events (paginated from batch)
  const [allFetchedEvents, setAllFetchedEvents] = useState<UnifiedEventItem[]>([]);
  const [displayedEvents, setDisplayedEvents] = useState<UnifiedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [apiOffset, setApiOffset] = useState(0); // Offset for API calls
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE); // How many to show
  const [hasMoreFromApi, setHasMoreFromApi] = useState(true); // More from server
  const feedRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [engagedAtLoad, setEngagedAtLoad] = useState<Set<string>>(new Set());
  const [excludedArtists, setExcludedArtists] = useState<Set<string>>(new Set());
  const [relationsLoaded, setRelationsLoaded] = useState(false);
  // Latches true once everything that reshapes the list (reviews, friend shows, saved
  // shows, hidden artists) has arrived, so the feed draws once instead of shuffling.
  const [firstPaintReady, setFirstPaintReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    const onStreamingSyncComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== currentUserId) return;
      void queryClient.invalidateQueries({ queryKey: ['feed', 'home', currentUserId] });
    };
    window.addEventListener('synth:streaming-sync-complete', onStreamingSyncComplete);
    return () => {
      window.removeEventListener('synth:streaming-sync-complete', onStreamingSyncComplete);
    };
  }, [currentUserId, queryClient]);
  
  // Background prefetching state
  const isPrefetchingRef = useRef(false);
  const prefetchedEventsRef = useRef<UnifiedEventItem[]>([]);
  const prefetchedOffsetRef = useRef<number>(0);
  
  // Ref for refresh function to avoid stale closures in touch handlers
  const refreshFnRef = useRef<() => Promise<void>>();
  const isRefreshingRef = useRef(false);
  
  // Track if initial load has completed to prevent re-fetching on filter changes
  const initialLoadCompleteRef = useRef(false);
  const allFetchedEventsRef = useRef<UnifiedEventItem[]>([]);

  const filterSignature = useMemo(() => {
    const f = filters as any;
    const cached = typeof window !== 'undefined'
      ? getLastKnownLocation(LOCATION_CACHE_MAX_AGE_MS)
      : null;
    return JSON.stringify({
      genres: f?.genres,
      selectedCities: f?.selectedCities,
      radiusMiles: f?.radiusMiles,
      latitude: f?.latitude,
      longitude: f?.longitude,
      dateRange: f?.dateRange
        ? { from: f.dateRange.from?.toISOString(), to: f.dateRange.to?.toISOString() }
        : undefined,
      cachedLat: cached?.lat,
      cachedLng: cached?.lng,
    });
  }, [filters]);
 
  // User location and preferences
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userTopGenres, setUserTopGenres] = useState<string[]>([]);
  // Track if we already used location/genres in a reload (so catch-up effect only runs once when they become available)
  const hadLocationForReloadRef = useRef(false);
  const hadGenresForReloadRef = useRef(false);
  const lastReloadLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const { data: cachedFeed, isLoading: queryLoading, isError: feedIsError, refetch: refetchFeed } = useQuery({
    queryKey: ['feed', 'home', currentUserId, filterSignature],
    queryFn: async () => {
      const f = filters as any;
      const dateTo = f?.dateRange?.to;
      const maxDaysAhead = dateTo ? Math.ceil((dateTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 90;
      const cached = getLastKnownLocation(LOCATION_CACHE_MAX_AGE_MS);

      const baseFilters = {
        genres: (f?.genres && f.genres.length > 0) ? f.genres : undefined,
        dateRange: f?.dateRange,
        radiusMiles: f?.radiusMiles ?? 50,
        selectedCities: f?.selectedCities,
        includePast: false,
        maxDaysAhead,
      };
      const filterLoc = (f?.latitude != null && f?.longitude != null) ? { lat: f.latitude, lng: f.longitude } : null;
      const cachedLoc = cached ? { lat: cached.lat, lng: cached.lng } : null;

      const result = await fetchFeedForLocations(
        currentUserId,
        baseFilters,
        filterLoc,
        cachedLoc,
        INITIAL_FEED_SIZE
      );

      const primaryLoc = filterLoc ?? cachedLoc;
      if (primaryLoc) {
        saveLastKnownLocation(primaryLoc.lat, primaryLoc.lng);
      }

      return {
        events: result.events,
        hasMore: result.hasMore,
        latitude: primaryLoc?.lat,
        longitude: primaryLoc?.lng,
      };
    },
    enabled: !!currentUserId,
    staleTime: 5 * 60 * 1000,  // treat feed as fresh for 5 min — RPC is expensive
    gcTime: 15 * 60 * 1000,    // keep in memory for 15 min so back-nav is instant
  });

  useEffect(() => {
    if (cachedFeed) {
      // Mix friend-interested events in with natural spacing (after the pinned shows).
      // Ones that don't fit wait for later pages rather than being dumped at the end.
      let merged = filterUpcomingFeedItems(cachedFeed.events);
      if (extraEvents && extraEvents.length > 0) {
        const seen = new Set(merged.map((e) => e.event_id));
        const fresh = filterUpcomingFeedItems(extraEvents).filter((e) => !seen.has(e.event_id));
        if (fresh.length > 0) {
          const pinnedCount = merged.findIndex((e) => !e.just_announced);
          const head = pinnedCount < 0 ? merged : merged.slice(0, pinnedCount);
          const rest = pinnedCount < 0 ? [] : merged.slice(pinnedCount);
          const placed = planNaturalWeave(rest, fresh, {
            seed: dailySeed(`${currentUserId}:friend-events`),
            ...FRIEND_EVENT_WEAVE,
          });
          const interleaved: UnifiedEventItem[] = [...head];
          rest.forEach((item, i) => {
            interleaved.push(item);
            const extra = placed.get(i);
            if (extra) interleaved.push(extra);
          });
          merged = interleaved;
        }
      }
      setAllFetchedEvents(merged);
      setDisplayedEvents(merged.slice(0, PAGE_SIZE));
      setHasMoreFromApi(cachedFeed.hasMore);
      setApiOffset(merged.length);
      allFetchedEventsRef.current = merged;
      if (typeof cachedFeed.latitude === 'number' && typeof cachedFeed.longitude === 'number') {
        lastReloadLocationRef.current = {
          lat: cachedFeed.latitude,
          lng: cachedFeed.longitude,
        };
      }
      setLoading(false);
    }
  }, [cachedFeed, extraEvents, currentUserId]);

  useEffect(() => {
    allFetchedEventsRef.current = allFetchedEvents;
  }, [allFetchedEvents]);

  // Keep retrying quietly in the background while the initial load has failed and we
  // still have nothing to show — react-query's built-in retries (3 attempts, backoff)
  // cover the first few seconds, but a sustained backend issue (e.g. an RPC timeout)
  // can outlast those. Never give up and show "no events": a real backend failure
  // must never be presented as "there's nothing here" — see feed_v5 hotfix history.
  useEffect(() => {
    if (!feedIsError || displayedEvents.length > 0) return;
    const interval = setInterval(() => {
      void refetchFeed();
    }, 10000);
    return () => clearInterval(interval);
  }, [feedIsError, displayedEvents.length, refetchFeed]);

  const attachObserver = useIntersectionTrackingList(
    'event',
    displayedEvents.map((e, idx) => ({
      id: e.event_id,
      metadata: {
        ...getEventMetadata(e),
        source: 'feed',
        position: idx,
        just_announced: e.reasonLabel === JUST_ANNOUNCED_LABEL,
        is_fan: Boolean(e.is_fan),
      },
    })),
    {
      onView: (id, metadata) => {
        if (metadata?.just_announced) logJustAnnounced(supabase, id, 'impression', Boolean(metadata.is_fan), 'web');
      },
    }
  );

  // Compute whether we have more events to show (locally or from API)
  const hasMore = displayCount < allFetchedEvents.length || hasMoreFromApi;

  // Load feed on mount (fast path) and reload when filters or currentUserId change
  useEffect(() => {
    const f = filters as any;
    const dateTo = f?.dateRange?.to;
    const maxDaysAhead = dateTo ? Math.ceil((dateTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 90;

    const initFeed = async () => {
      if (!initialLoadCompleteRef.current) {
        initialLoadCompleteRef.current = true;
        if (allFetchedEvents.length === 0) setLoading(true);
        const locationAndPrefsPromise = Promise.allSettled([
          LocationService.getCurrentLocation(),
          supabase.from('user_preferences').select('top_genres').eq('user_id', currentUserId).single(),
        ]);
      const [locationResult, prefsResult] = await locationAndPrefsPromise;
      if (locationResult.status === 'fulfilled') {
        const loc = { lat: locationResult.value.latitude, lng: locationResult.value.longitude };
        setUserLocation(loc);
        saveLastKnownLocation(loc.lat, loc.lng);
      }
        if (prefsResult.status === 'fulfilled' && prefsResult.value.data?.top_genres) {
          // The feed RPC doesn't take genres, so refetching once they arrive only redraws the list.
          hadGenresForReloadRef.current = true;
          setUserTopGenres(prefsResult.value.data.top_genres);
        }
      } else {
        // Filter or userId change: reload with current filters (and location/prefs if available)
        if (userLocation) hadLocationForReloadRef.current = true;
        if (userTopGenres.length > 0) hadGenresForReloadRef.current = true;
        setLoading(true);
        const baseFilters = {
          genres: (f?.genres && f.genres.length > 0) ? f.genres : userTopGenres,
          dateRange: f?.dateRange,
          radiusMiles: f?.radiusMiles ?? 50,
          selectedCities: f?.selectedCities,
          includePast: false,
          maxDaysAhead,
        };
        const filterLoc = (f?.latitude != null && f?.longitude != null) ? { lat: f.latitude, lng: f.longitude } : null;
        const userLoc = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null;
        try {
          const result = await fetchFeedForLocations(
            currentUserId,
            baseFilters,
            filterLoc,
            userLoc,
            INITIAL_FEED_SIZE
          );
          const items = result.events;
          const currentCount = allFetchedEventsRef.current.length;
          const shouldOverwrite = items.length > 0 || currentCount === 0;
          if (shouldOverwrite) {
            setAllFetchedEvents(items);
            setDisplayedEvents(items.slice(0, PAGE_SIZE));
            setHasMoreFromApi(result.hasMore);
            setApiOffset(items.length);
            allFetchedEventsRef.current = items;
          }
          const primaryLoc = filterLoc ?? userLoc;
          if (primaryLoc) {
            lastReloadLocationRef.current = primaryLoc;
            saveLastKnownLocation(primaryLoc.lat, primaryLoc.lng);
          }
          if (items.length === 0) {
            console.warn('🎯 [UnifiedEventsFeed] Reload (filters/userId) returned 0 events. filterLoc:', filterLoc, 'userLoc:', userLoc);
          } else {
            console.log('🎯 [UnifiedEventsFeed] Reloaded', items.length, 'events (filters/userId change)');
          }
        } catch (error) {
          console.error('❌ [UnifiedEventsFeed] Error reloading feed (filters/userId):', error, 'filterLoc:', filterLoc, 'userLoc:', userLoc);
        } finally {
          setLoading(false);
        }
      }
    };

    initFeed();
    // Intentionally omit userLocation/userTopGenres: they are set in the initial path, so including them would re-run the effect and trigger an unnecessary reload after mount.
  }, [currentUserId, filters]);

  // When location or preferences become available after initial load (e.g. they finished loading after a filter change), reload once so the feed is personalized. Fixes: filter change before location loads -> non-personalized results with no automatic correction.
  useEffect(() => {
    if (!initialLoadCompleteRef.current) return;

    const locationJustAvailable = userLocation != null && !hadLocationForReloadRef.current;
    const genresJustAvailable = userTopGenres.length > 0 && !hadGenresForReloadRef.current;
    if (!locationJustAvailable && !genresJustAvailable) return;

    // If location just became available but hasn't changed meaningfully from the last used
    // location (and there are no new genres), avoid an extra reload.
    if (locationJustAvailable && userLocation && lastReloadLocationRef.current) {
      const distance = LocationService.calculateDistance(
        lastReloadLocationRef.current.lat,
        lastReloadLocationRef.current.lng,
        userLocation.lat,
        userLocation.lng
      );
      if (distance < LOCATION_RELOAD_THRESHOLD_MILES && !genresJustAvailable) {
        return;
      }
    }

    if (userLocation) hadLocationForReloadRef.current = true;
    if (userTopGenres.length > 0) hadGenresForReloadRef.current = true;

    const f = filters as any;
    const dateTo = f?.dateRange?.to;
    const maxDaysAhead = dateTo ? Math.ceil((dateTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 90;
    const baseFilters = {
      genres: (f?.genres && f.genres.length > 0) ? f.genres : userTopGenres,
      dateRange: f?.dateRange,
      radiusMiles: f?.radiusMiles ?? 50,
      selectedCities: f?.selectedCities,
      includePast: false,
      maxDaysAhead,
    };
    const filterLoc = (f?.latitude != null && f?.longitude != null) ? { lat: f.latitude, lng: f.longitude } : null;
    const userLoc = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null;

    setLoading(true);
    fetchFeedForLocations(currentUserId, baseFilters, filterLoc, userLoc, INITIAL_FEED_SIZE)
      .then((result) => {
        const items = result.events;
        const currentCount = allFetchedEventsRef.current.length;
        const shouldOverwrite = items.length > 0 || currentCount === 0;
        if (shouldOverwrite) {
          setAllFetchedEvents(items);
          setDisplayedEvents(items.slice(0, PAGE_SIZE));
          setHasMoreFromApi(result.hasMore);
          setApiOffset(items.length);
          allFetchedEventsRef.current = items;
        }
        const primaryLoc = filterLoc ?? userLoc;
        if (primaryLoc) {
          lastReloadLocationRef.current = primaryLoc;
          saveLastKnownLocation(primaryLoc.lat, primaryLoc.lng);
        }
        if (items.length === 0) {
          console.warn('🎯 [UnifiedEventsFeed] Reload (location/prefs) returned 0 events. filterLoc:', filterLoc, 'userLoc:', userLoc);
        } else {
          console.log('🎯 [UnifiedEventsFeed] Reloaded', items.length, 'events (location/prefs became available)');
        }
      })
      .catch((error) => console.error('❌ [UnifiedEventsFeed] Error reloading feed with location/prefs:', error, 'filterLoc:', filterLoc, 'userLoc:', userLoc))
      .finally(() => setLoading(false));
  }, [currentUserId, filters, userLocation, userTopGenres]);

  // Auto-retry: if the feed finishes loading but returns 0 events (RPC cold start,
  // network hiccup, etc.), silently retry once after 5 seconds so the user never
  // sees an empty feed that would resolve with a manual refresh.
  const autoRetryFiredRef = useRef(false);
  useEffect(() => {
    if (loading || queryLoading) return; // still loading
    if (displayedEvents.length > 0) {
      autoRetryFiredRef.current = false; // reset on next empty
      return;
    }
    if (autoRetryFiredRef.current) return; // only retry once per mount
    autoRetryFiredRef.current = true;

    const timer = setTimeout(async () => {
      console.warn('🔄 [UnifiedEventsFeed] 0 events detected — auto-retrying feed fetch');
      try {
        const f = filters as any;
        const dateTo = f?.dateRange?.to;
        const maxDaysAhead = dateTo ? Math.ceil((dateTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 90;
        const baseFilters = {
          genres: (f?.genres && f.genres.length > 0) ? f.genres : userTopGenres,
          dateRange: f?.dateRange,
          radiusMiles: f?.radiusMiles ?? 50,
          selectedCities: f?.selectedCities,
          includePast: false,
          maxDaysAhead,
        };
        const filterLoc = (f?.latitude != null && f?.longitude != null) ? { lat: f.latitude, lng: f.longitude } : null;
        const userLoc = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null;
        const result = await fetchFeedForLocations(currentUserId, baseFilters, filterLoc, userLoc, INITIAL_FEED_SIZE);
        if (result.events.length > 0) {
          setAllFetchedEvents(result.events);
          setDisplayedEvents(result.events.slice(0, PAGE_SIZE));
          setHasMoreFromApi(result.hasMore);
          setApiOffset(result.events.length);
          allFetchedEventsRef.current = result.events;
        }
      } catch (err) {
        console.error('❌ [UnifiedEventsFeed] Auto-retry failed:', err);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [loading, queryLoading, displayedEvents.length, currentUserId, filters, userLocation, userTopGenres]);

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
    
    const items = filterUpcomingFeedItems(result.events.map((e) => personalEventToItem(e, (e as any).event_type)));
    if (feedFilters?.latitude != null && feedFilters?.longitude != null) {
      lastReloadLocationRef.current = {
        lat: feedFilters.latitude,
        lng: feedFilters.longitude,
      };
      saveLastKnownLocation(feedFilters.latitude, feedFilters.longitude);
    }
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
      const combined = appendUnique(allFetchedEvents, prefetchedEventsRef.current);
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
      const combined = appendUnique(allFetchedEvents, newEvents);
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

  // Automatically load more events when the user scrolls near the end of the list.
  // Uses a lightweight IntersectionObserver on a sentinel div instead of a button click,
  // so pagination still happens in chunks and we don't load an infinite list all at once.
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const scrollRoot = feedRef.current;

    if (!sentinel || !scrollRoot) return;
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Let the existing pagination logic decide whether to use cached items
            // or fetch the next page from the server.
            loadMore();
            break;
          }
        }
      },
      {
        root: scrollRoot,
        // Trigger when the sentinel is close to the bottom of the viewport
        rootMargin: '0px 0px 200px 0px', // Start loading slightly before the user hits the end
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore, displayedEvents.length]);

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
    const interestedPromise = Promise.resolve(
      supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('user_id', currentUserId)
        .in('relationship_type', ['interested', 'going', 'maybe'])
    )
      .then(({ data }) => {
        if (!data) return;
        const ids = new Set(data.map(r => r.event_id));
        setInterestedEvents(ids);
        // Snapshot, not live: a card the user taps "I'm in" on stays put until the next load.
        setEngagedAtLoad(new Set(ids));
      });
    const excludedPromise = ArtistExclusionService.list(currentUserId).then(setExcludedArtists);
    void Promise.allSettled([interestedPromise, excludedPromise]).then(() => setRelationsLoaded(true));
  }, [currentUserId]);

  useEffect(() => {
    if (firstPaintReady) return;
    if (relationsLoaded && !extrasLoading) {
      setFirstPaintReady(true);
      return;
    }
    // Never hold the feed hostage to a slow side request.
    const timer = setTimeout(() => setFirstPaintReady(true), 4000);
    return () => clearTimeout(timer);
  }, [firstPaintReady, relationsLoaded, extrasLoading]);

  // Initial load is now handled in the location fetch effect above

  // Refresh function with visual feedback - always reference the latest filters via refs
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
        const items = filterUpcomingFeedItems(result.events.map((e) => personalEventToItem(e, (e as any).event_type)));
        
        setAllFetchedEvents(items);
        setDisplayedEvents(items.slice(0, PAGE_SIZE));
        setHasMoreFromApi(result.hasMore);
        setApiOffset(items.length);
        if (feedFilters?.latitude != null && feedFilters?.longitude != null) {
          lastReloadLocationRef.current = {
            lat: feedFilters.latitude,
            lng: feedFilters.longitude,
          };
          saveLastKnownLocation(feedFilters.latitude, feedFilters.longitude);
        }
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

  const handleRefreshButtonClick = useCallback(() => {
    if (isRefreshingRef.current) return;
    refreshFnRef.current?.();
  }, []);

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

  const findEvent = (eventId: string): UnifiedEventItem | null => {
    return allFetchedEvents.find((e) => e.event_id === eventId) ?? null;
  };

  const handleInterestToggle = async (eventId: string, e: React.MouseEvent) => {
    hapticLight();
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

  const handleJoinEventChat = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticLight();
    const event = findEvent(eventId);
    const eventUuid = event ? getEventUuid(event) : null;
    if (!eventUuid) {
      toast({ title: "Can't open chat", description: 'This event is missing an ID.', duration: 4000 });
      return;
    }
    try {
      await VerifiedChatService.joinOrOpenVerifiedChat('event', eventUuid, event?.title || 'Event', currentUserId);
      toast({
        title: 'Joined event chat',
        description: 'Find it in your Chats tab to coordinate with others going.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Error joining event chat:', error);
      toast({ title: "Couldn't join chat", description: 'Please try again.', duration: 4000 });
    }
  };

  const getImageUrl = (event: UnifiedEventItem): string =>
    resolveEventCardImageUrl({
      id: event.event_id,
      event_media_url: event.event_media_url,
      images: event.images,
      poster_image_url: event.poster_image_url,
      image_url: event.image_url,
    });

  const threadEntries = useMemo<ThreadEntry[]>(() => {
    const isVisible = (e: UnifiedEventItem) =>
      !engagedAtLoad.has(e.event_id) && !(e.artist_id && excludedArtists.has(e.artist_id));
    const events = displayedEvents.filter(isVisible);
    const insertAt = insertSectionAfterIndex != null && middleSection != null ? insertSectionAfterIndex : -1;

    // Reviews go after the pinned new shows, spaced naturally, and next to a show by the
    // same artist or at the same venue when one comes up.
    const firstUnpinned = events.findIndex((e) => !e.just_announced);
    const pinnedCount = firstUnpinned < 0 ? events.length : firstUnpinned;
    const match = (review: ThreadNode, event: UnifiedEventItem) =>
      reviewEventMatch(
        { artist_id: review.artistId, venue_id: review.venueId, venue_feedback: review.venueFeedback },
        event
      );
    const placed = planNaturalWeave(events.slice(pinnedCount), reviewNodes ?? [], {
      seed: dailySeed(`${currentUserId}:reviews`),
      ...REVIEW_WEAVE,
      relatesTo: (review, event) => match(review, event) !== null,
    });

    const entries: ThreadEntry[] = [];
    events.forEach((item, i) => {
      if (i === insertAt) entries.push({ kind: 'section', node: middleSection });
      entries.push({ kind: 'event', item });
      const review = i >= pinnedCount ? placed.get(i - pinnedCount) : undefined;
      if (review) entries.push({ kind: 'review', key: review.key, node: review.render(match(review, item)) });
    });
    if (insertAt >= events.length) entries.push({ kind: 'section', node: middleSection });
    return entries;
  }, [displayedEvents, reviewNodes, engagedAtLoad, excludedArtists, insertSectionAfterIndex, middleSection, currentUserId]);

  const threadEvents = threadEntries.flatMap((e) => (e.kind === 'event' ? [e.item] : []));
  const reviewHighlights = useReviewHighlights(
    threadEvents.flatMap((e) => (e.artist_id ? [e.artist_id] : [])),
    threadEvents.flatMap((e) => (e.venue_id ? [e.venue_id] : []))
  );

  // Artist average + venue average (max one line each, no counts). The venue line only
  // shows on a show at that venue, and only uses venue ratings/feedback.
  const getRatings = (event: UnifiedEventItem): CardRatings | undefined => {
    const artist = event.artist_id ? reviewHighlights.artists.get(event.artist_id) : undefined;
    const venue = event.venue_id ? reviewHighlights.venues.get(event.venue_id) : undefined;
    if (!artist && !venue) return undefined;
    return {
      artist: artist && event.artist_name ? { ...artist, name: event.artist_name } : undefined,
      venue: venue && event.venue_name ? { ...venue, name: event.venue_name } : undefined,
    };
  };

  const handleHideArtist = async (event: UnifiedEventItem) => {
    const artistId = event.artist_id;
    if (!artistId) return;
    const name = event.artist_name || 'this artist';
    const setHidden = (hidden: boolean) =>
      setExcludedArtists((prev) => {
        const next = new Set(prev);
        if (hidden) next.add(artistId);
        else next.delete(artistId);
        return next;
      });

    hapticLight();
    setHidden(true);
    try {
      await ArtistExclusionService.exclude(currentUserId, artistId);
      toast({
        title: `We'll stop recommending ${name}`,
        description: 'Their shows are hidden from your feed.',
        duration: 6000,
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              setHidden(false);
              try {
                await ArtistExclusionService.restore(currentUserId, artistId);
              } catch (error) {
                console.error('Error restoring artist:', error);
                setHidden(true);
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (error) {
      console.error('Error excluding artist:', error);
      setHidden(false);
      toast({ title: "Couldn't hide that artist", description: 'Please try again.', duration: 4000 });
    }
  };

  if (!firstPaintReady || (loading && displayedEvents.length === 0)) {
    return (
      <div className="swift-ui-feed-container">
        <SynthLoadingInline
          text={feedIsError ? 'Having trouble loading — retrying…' : 'Loading events...'}
          size="md"
        />
      </div>
    );
  }

  // Never render the "no events" state off the back of a failed fetch — only a
  // genuinely successful, empty response should ever say there's nothing here.
  if (feedIsError && displayedEvents.length === 0) {
    return (
      <div className="swift-ui-feed-container">
        <SynthLoadingInline text="Having trouble loading — retrying…" size="md" />
      </div>
    );
  }

  if (displayedEvents.length === 0 && !hasMore) {
    return (
      <div className="swift-ui-feed-container flex items-center justify-center">
        <div className="text-center py-12 px-4">
          <p className="text-lg font-semibold var(--neutral-900) mb-2">No events found</p>
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
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderRadius: '999px', backgroundColor: 'var(--neutral-50)', border: 'var(--border-default)', boxShadow: 'var(--shadow-default)' }}>
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
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="home-thread">
          <div className="home-thread__list">
          {threadEntries.map((entry, index) => {
            if (entry.kind === 'section') {
              return (
                <div key="thread-section" className="thread-item" data-variant="section" data-reason="friend_interested">
                  <span className="thread-item__node" aria-hidden="true" />
                  {entry.node}
                </div>
              );
            }
            if (entry.kind === 'review') {
              return (
                <div key={`review-${entry.key}`} className="thread-item" data-reason="review">
                  <span className="thread-item__node" aria-hidden="true" />
                  <div className="thread-review">{entry.node}</div>
                </div>
              );
            }
            const event = entry.item;
            const imageUrl = getImageUrl(event);
            const isInterested = interestedEvents.has(event.event_id) || event.user_is_interested || false;
            const interestedCount = event.interested_count || 0;
            const friendsInterestedCount = event.friends_interested_count || 0;
            const isPick5 = event.reason === 'pick5' || !!findPick5Band(event.artist_name);
            return (
                <div
                  key={`${event.event_id}-${event.reason}`}
                  className="thread-item"
                  data-reason={event.reason}
                  data-pick5={isPick5 || undefined}
                  ref={(el) => attachObserver(el, event.event_id)}
                  style={{ animationDelay: `${Math.min(index, 4) * 60}ms` }}
                >
                  <span className="thread-item__node" aria-hidden="true" />
                  <ThreadEventCard
                    event={{
                      id: event.event_id,
                      title: event.title,
                      artist_name: event.artist_name,
                      venue_name: event.venue_name,
                      event_date: event.event_date,
                      venue_city: event.venue_city,
                      venue_state: event.venue_state,
                      image_url: imageUrl,
                      poster_image_url: event.poster_image_url,
                      ticket_urls: event.ticket_urls,
                    }}
                    reason={event.reason}
                    reasonLabel={event.reasonLabel}
                    interestedCount={interestedCount}
                    friendsInterestedCount={friendsInterestedCount}
                    distanceLabel={formatDistance(event.distance_miles)}
                    isInterested={isInterested}
                    ratings={getRatings(event)}
                    onInterestClick={(e) => handleInterestToggle(event.event_id, e)}
                    onShareClick={(e) => onShareClick?.(event, e)}
                    onJoinChatClick={(e) => handleJoinEventChat(event.event_id, e)}
                    onHideArtist={event.artist_id ? () => void handleHideArtist(event) : undefined}
                    onClick={() => {
                      if (event.reasonLabel === JUST_ANNOUNCED_LABEL) {
                        logJustAnnounced(supabase, event.event_id, 'open', Boolean(event.is_fan), 'web');
                      }
                      onEventClick?.(event.event_id);
                    }}
                  />
                </div>
            );
          })}
          </div>
        </div>
        
        {/* Load More Button - SwiftUI Glassmorphism Style with Synth Pink */}
        {/* Always show the button - users can try to load more even if we think we're done */}
        <div className="flex justify-center py-6 px-4">
          <Button
            type="button"
            variant="default"
            className="px-8 py-3 rounded-2xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            disabled={hasMore ? loadingMore : isRefreshing}
            onClick={hasMore ? loadMore : handleRefreshButtonClick}
          >
            {hasMore ? (
              loadingMore ? (
                <>
                  <SynthLoader variant="spinner" size="sm" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span className="text-inherit">Load More</span>
                  <svg
                    className="w-4 h-4 text-inherit"
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
              )
            ) : isRefreshing ? (
              <>
                <SynthLoader variant="spinner" size="sm" />
                <span>Refreshing...</span>
              </>
            ) : (
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
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

