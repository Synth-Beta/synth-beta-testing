import {
  weaveBucketListIntoFeed,
  boostEventsByArtistAffinity,
  getUserArtistAffinity,
  BUCKET_LIST_TOP_LIMIT,
  JUST_ANNOUNCED_LABEL,
  logJustAnnounced,
  planNaturalWeave,
  dailySeed,
  reviewEventMatch,
  type ReviewMatch,
  fetchReviewHighlights,
  EMPTY_REVIEW_HIGHLIGHTS,
  type ReviewHighlights,
} from '@synth/shared';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, RefreshControl, Platform, Pressable, Text } from 'react-native';
import { Search } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useTour } from '../../lib/tourProgress';
import { FeedHeader } from '../../src/components/Feed/FeedHeader';
import { EventCard, type CardRatingLine } from '../../src/components/Feed/EventCard';
import { ThreadReviewCard } from '../../src/components/Feed/ThreadReviewCard';
import { LocationPill } from '../../src/components/discover/LocationPill';
import { ArtistExclusionService } from '../../src/services/artistExclusionService';
import { SynthText } from '../../src/components/SynthText';
import { FriendSuggestionsRail } from '../../src/components/Feed/FriendSuggestionsRail';
import { FeedListSkeleton } from '../../src/components/skeletons/FeedListSkeleton';
import {
  FriendSuggestion,
  HomeFeedService,
  NetworkReview,
  UnifiedPersonalizedEvent,
} from '../../src/services/homeFeedService';
import { NotificationService } from '../../src/services/notificationService';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventService } from '../../src/services/eventService';
import { bottomSafeContentPadding } from '../../src/components/navigation/SynthTabBar';
import { useInterested } from '../../src/contexts/InterestedContext';
import { useBrowseLocation } from '../../src/contexts/BrowseLocationContext';
import { resolveFeedImageUri } from '../../src/utils/eventImages';
import { isEventUpcomingForFeed } from '../../src/utils/localYmd';

type ListItem =
  | { kind: 'event'; data: UnifiedPersonalizedEvent }
  | { kind: 'review'; data: NetworkReview; match: ReviewMatch | null };

// Same spacing as web UnifiedEventsFeed (REVIEW_WEAVE / FRIEND_EVENT_WEAVE).
const REVIEW_WEAVE = { firstAt: 4, minGap: 5, maxGap: 9 };
const FRIEND_EVENT_WEAVE = { firstAt: 3, minGap: 4, maxGap: 7 };

// Module-level: FlashList can't change viewabilityConfig after mount.
const JUST_ANNOUNCED_VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 500 };
export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<UnifiedPersonalizedEvent[]>([]);
  const [reviews, setReviews] = useState<NetworkReview[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [friendSuggestions, setFriendSuggestions] = useState<FriendSuggestion[]>([]);
  const [bucketListEvents, setBucketListEvents] = useState<UnifiedPersonalizedEvent[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<ReviewHighlights>(EMPTY_REVIEW_HIGHLIGHTS);
  const retryAttemptRef = useRef(0);
  const { seedFromFeed } = useInterested();
  const { coords: browseCoords, radiusMiles: browseRadiusMiles } = useBrowseLocation();

  // Save the browse location server-side so "just announced" alerts match the area the
  // user actually browses. Rounded to ~1km: enough for a radius match, avoids storing
  // exact GPS, and stops GPS jitter from triggering a write on every render.
  const browseLat = browseCoords ? Math.round(browseCoords.latitude * 100) / 100 : null;
  const browseLng = browseCoords ? Math.round(browseCoords.longitude * 100) / 100 : null;
  useEffect(() => {
    if (!viewerUserId || browseLat == null || browseLng == null) return;
    supabase
      .rpc('set_browse_location', {
        p_latitude: browseLat,
        p_longitude: browseLng,
        p_radius_miles: Math.round(browseRadiusMiles),
      })
      .then(({ error }) => {
        if (error) console.warn('[home] set_browse_location failed', error.message);
      });
  }, [viewerUserId, browseLat, browseLng, browseRadiusMiles]);

  // Bucket-list shows are woven into the ranked feed rather than shown on their own rail,
  // matching web. Ones the ranker already returned keep its ordering and its enriched copy;
  // only the ones it missed get injected, spaced out. Shared helper so both platforms
  // order the feed identically.
  //
  // One thread like web: reviews go after the pinned new shows, spaced naturally, and next
  // to a show by the same artist or at the same venue when one comes up.
  const listData: ListItem[] = useMemo(() => {
    const woven = weaveBucketListIntoFeed(
      events,
      bucketListEvents,
      e => e.id,
      4,
      viewerUserId ? dailySeed(`${viewerUserId}:bucket`) : undefined
    );
    const firstUnpinned = woven.findIndex(e => !e.just_announced);
    const pinnedCount = firstUnpinned < 0 ? woven.length : firstUnpinned;
    const placed = planNaturalWeave(woven.slice(pinnedCount), reviews, {
      seed: dailySeed(`${viewerUserId ?? 'anon'}:reviews`),
      ...REVIEW_WEAVE,
      relatesTo: (review, event) => reviewEventMatch(review, event) !== null,
    });
    const items: ListItem[] = [];
    woven.forEach((data, i) => {
      items.push({ kind: 'event', data });
      const review = i >= pinnedCount ? placed.get(i - pinnedCount) : undefined;
      if (review) items.push({ kind: 'review', data: review, match: reviewEventMatch(review, data) });
    });
    return items;
  }, [events, bucketListEvents, reviews, viewerUserId]);

  // Artist / venue average rating lines under each show (shared rules with web).
  const highlightKey = events.map(e => e.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const artistIds = events.flatMap(e => (e.artist_id ? [String(e.artist_id)] : []));
    const venueIds = events.flatMap(e => (e.venue_id ? [String(e.venue_id)] : []));
    void fetchReviewHighlights(supabase, artistIds, venueIds).then(h => {
      if (!cancelled) setHighlights(h);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey]);

  const getRatings = (e: UnifiedPersonalizedEvent): { artist?: CardRatingLine; venue?: CardRatingLine } | undefined => {
    const artist = e.artist_id ? highlights.artists.get(String(e.artist_id)) : undefined;
    const venue = e.venue_id ? highlights.venues.get(String(e.venue_id)) : undefined;
    if (!artist && !venue) return undefined;
    return {
      artist: artist && e.artist_name ? { ...artist, name: e.artist_name } : undefined,
      venue: venue && e.venue_name ? { ...venue, name: e.venue_name } : undefined,
    };
  };

  const hideArtist = useCallback(
    (artistId: string) => {
      if (!viewerUserId) return;
      const prevEvents = events;
      const prevBucket = bucketListEvents;
      setEvents(list => list.filter(e => String(e.artist_id) !== artistId));
      setBucketListEvents(list => list.filter(e => String(e.artist_id) !== artistId));
      ArtistExclusionService.exclude(viewerUserId, artistId).catch(err => {
        console.warn('[home] hide artist failed', err);
        setEvents(prevEvents);
        setBucketListEvents(prevBucket);
      });
    },
    [viewerUserId, events, bucketListEvents]
  );

  // Impressions for the 10-day just-announced test (just_announced_feed_report): once per
  // card per screen mount. Stable ref - FlashList ignores a changed callback.
  const loggedJustAnnouncedRef = useRef<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: ListItem }> }) => {
      for (const { item } of viewableItems) {
        if (item?.kind !== 'event' || item.data.feedLabel !== JUST_ANNOUNCED_LABEL) continue;
        if (loggedJustAnnouncedRef.current.has(item.data.id)) continue;
        loggedJustAnnouncedRef.current.add(item.data.id);
        logJustAnnounced(supabase, item.data.id, 'impression', Boolean(item.data.is_fan), Platform.OS === 'ios' ? 'ios' : 'android');
      }
    }
  ).current;

  const fetchFeed = useCallback(async () => {
    try {
      // Use getSession() (local storage, no network) so the feed loads even on
      // spotty first-launch connectivity. getUser() validates the JWT remotely
      // and returns null on any hiccup, causing an empty feed that refresh can't fix.
      // Location comes from the shared BrowseLocationContext (GPS by default,
      // or whatever the user picked in Discover) rather than a fresh GPS call
      // here, so Home and Discover always agree on "where am I browsing".
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      // A failed token refresh (slow network) is an error, not "signed out": throw so
      // the catch below keeps the last-loaded feed instead of wiping it.
      if (sessionError) throw sessionError;
      const loc = browseCoords;
      const user = session?.user ?? null;
      if (!user) {
        setViewerUserId(null);
        setEvents([]);
        setReviews([]);
        setFriendSuggestions([]);
        setBucketListEvents([]);
        return;
      }
      setViewerUserId(user.id);

      // Unread count / friend suggestions rail / main feed content are all independent
      // of each other — run them together so total load time is the slowest request.
      const unreadPromise = NotificationService.getUnreadCount(user.id);
      const suggestionsPromise = HomeFeedService.getFriendSuggestionsForRail(user.id, 20);
      const bucketListEventsPromise = HomeFeedService.getBucketListEvents(
        user.id,
        BUCKET_LIST_TOP_LIMIT,
        loc ? { lat: loc.latitude, lng: loc.longitude, radiusMiles: browseRadiusMiles } : undefined
      );
      // Web has boosted the feed by streamed/reviewed artists since the affinity service
      // was added; mobile never did, which is most of why the two home feeds ranked
      // differently for the same account. Never rejects (it swallows its own errors).
      const affinityPromise = getUserArtistAffinity(supabase, user.id);

      {
        const [unread, suggestions, bucketEvents, affinity, unified, friendEvents, networkReviews] = await Promise.all([
          unreadPromise,
          suggestionsPromise,
          bucketListEventsPromise,
          affinityPromise,
          HomeFeedService.getUnifiedPersonalizedEvents(
            user.id, 50, loc?.latitude ?? null, loc?.longitude ?? null, browseRadiusMiles
          ),
          HomeFeedService.getNetworkEvents(user.id, 20),
          HomeFeedService.getNetworkReviews(user.id, 20),
        ]);
        setNotificationCount(unread);
        setFriendSuggestions(suggestions);
        setBucketListEvents(bucketEvents);
        setReviews(networkReviews);

        // Artists the user actually streams or has reviewed move to the front, keeping the
        // RPC's order within each group. New shows from the user's own artists (pinned by
        // get_personalized_feed_v5, context.just_announced) stay on top of that.
        const boosted = boostEventsByArtistAffinity(unified, affinity);
        const ranked = [
          ...boosted.filter(e => e.just_announced),
          ...boosted.filter(e => !e.just_announced),
        ];

        // Convert friend network events → UnifiedPersonalizedEvent with FRIENDS label
        const friendEventIds = new Set(ranked.map(e => e.id));
        const friendsAsUnified: UnifiedPersonalizedEvent[] = friendEvents
          .filter(ne => !friendEventIds.has(ne.id)) // deduplicate
          .map(ne => ({
            id: ne.id,
            title: ne.title,
            artist_name: ne.artist_name,
            venue_name: ne.venue_name,
            venue_city: ne.venue_city,
            venue_state: ne.venue_state,
            event_date: ne.event_date,
            image_url: resolveFeedImageUri(ne.image_url) ?? undefined,
            feedLabel: 'FRIENDS' as const,
            interested_count: ne.interested_count ?? 0,
            user_is_interested: false,
            ticket_url: undefined,
            artist_id: ne.artist_id,
            venue_id: undefined,
            friends_interested: ne.friends_all ?? [],
          }));

        // Friend events: natural spacing after the pinned shows (same helper + ranges as web).
        const pinnedCount = ranked.filter(e => e.just_announced).length;
        const rest = ranked.slice(pinnedCount);
        const placed = planNaturalWeave(rest, friendsAsUnified, {
          seed: dailySeed(`${user.id}:friend-events`),
          ...FRIEND_EVENT_WEAVE,
        });
        const merged: UnifiedPersonalizedEvent[] = ranked.slice(0, pinnedCount);
        rest.forEach((e, i) => {
          merged.push(e);
          const extra = placed.get(i);
          if (extra) merged.push(extra);
        });

        const enriched = await HomeFeedService.enrichUnifiedEventsWithArtistImages(merged);
        const upcomingOnly = enriched.filter((e) => isEventUpcomingForFeed(e.event_date));
        setEvents(upcomingOnly);
        seedFromFeed(upcomingOnly);
      }
      setFeedError(false);
      retryAttemptRef.current = 0;
    } catch (error) {
      // Deliberately NOT clearing events/reviews/viewerUserId here:
      // a transient backend failure (e.g. an RPC timeout) must never present as
      // "no events" by wiping out whatever was last successfully loaded. Only
      // the "no session" branch above clears those, since that's a real reason
      // to show nothing. See the feed_v5 RPC-500 hotfix history for why this
      // distinction matters.
      console.error('Error fetching feed:', error);
      setFeedError(true);
    } finally {
      setRefreshing(false);
      setFeedLoading(false);
    }
    // browseCoords in deps: refetch whenever the active browse location
    // changes (picked in Discover, or reset back to live GPS) - this is
    // what makes Home actually reflect a manually chosen location.
  }, [browseCoords?.latitude, browseCoords?.longitude, browseRadiusMiles]);

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  const refreshNotificationBadge = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setNotificationCount(0);
      return;
    }
    const unread = await NotificationService.getUnreadCount(user.id);
    setNotificationCount(unread);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshNotificationBadge();
    }, [refreshNotificationBadge])
  );

  // Auto-retry with backoff while we still have nothing to show. Covers two
  // cases: (1) GPS cold-start / RPC warm-up where the first call succeeds but
  // returns 0 results, and (2) a real backend failure (feedError) — in both
  // cases we keep trying quietly rather than ever settling on a dead-end empty
  // state after a single attempt. Capped at 6 attempts (~65s total) so a
  // genuinely persistent outage doesn't retry forever in the background.
  useEffect(() => {
    if (feedLoading || refreshing) return; // still loading or user-triggered refresh in progress
    const isEmpty = events.length === 0;
    if (!isEmpty) {
      retryAttemptRef.current = 0; // reset once we have data
      return;
    }
    if (retryAttemptRef.current >= 6) return; // give up retrying automatically; pull-to-refresh still works
    const attempt = retryAttemptRef.current;
    const delayMs = Math.min(4000 * Math.pow(1.6, attempt), 20000);
    const t = setTimeout(() => {
      retryAttemptRef.current += 1;
      void fetchFeed();
    }, delayMs);
    return () => clearTimeout(t);
  }, [feedLoading, refreshing, events.length, fetchFeed]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchFeed();
  };

  // App tutorial: the first show is the one it spotlights; bring it into view for those steps.
  const listRef = useRef<FlashListRef<ListItem>>(null);
  const tourStep = useTour()?.step;
  const tourCardIndex = listData.findIndex((i) => i.kind === 'event');
  useEffect(() => {
    if ((tourStep === 'feed' || tourStep === 'save') && tourCardIndex >= 0) {
      void listRef.current?.scrollToIndex({ index: tourCardIndex, animated: true });
    }
  }, [tourStep, tourCardIndex]);

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.kind === 'review') {
      return (
        <ThreadReviewCard
          review={item.data}
          match={item.match}
          currentUserId={viewerUserId}
          onPress={() => router.push(`/review/${item.data.id}`)}
        />
      );
    }

    return (
      <EventCard
        id={item.data.id}
        title={item.data.title}
        artist_name={item.data.artist_name}
        venue_name={item.data.venue_name}
        venue_city={item.data.venue_city}
        venue_state={item.data.venue_state}
        event_date={item.data.event_date}
        image_url={item.data.image_url}
        cornerLabel={item.data.feedLabel}
        initialInterested={Boolean(item.data.user_is_interested)}
        interested_count={item.data.interested_count}
        ticket_url={item.data.ticket_url}
        artist_id={item.data.artist_id}
        venue_id={item.data.venue_id}
        currentUserId={viewerUserId}
        friendsInterested={item.data.friends_interested}
        ratings={getRatings(item.data)}
        onHideArtist={item.data.artist_id ? () => hideArtist(String(item.data.artist_id)) : undefined}
        tourTarget={index === tourCardIndex}
        onPress={() => {
          if (item.data.feedLabel === JUST_ANNOUNCED_LABEL) {
            logJustAnnounced(supabase, item.data.id, 'open', Boolean(item.data.is_fan), Platform.OS === 'ios' ? 'ios' : 'android');
          }
          void EventService.toEventRouteId(item.data.id).then((rid) => {
            router.push(`/event/${rid}` as any);
          });
        }}
      />
    );
  };

  // Only claim "no events/reviews" when the last fetch actually succeeded with
  // zero results. If it failed, say so and keep retrying instead — a backend
  // hiccup must never present as "there's nothing here".
  const emptyMessage = feedError
    ? 'Having trouble loading. Retrying…'
    : 'No events yet. Pull to refresh.';

  const listHeader = useMemo(
    () => (
      <>
        {/* Search + location live on Home now (Community replaced Discover), like web. */}
        <View style={styles.searchWrap}>
          <Pressable
            style={styles.searchBar}
            onPress={() => router.push('/(tabs)/search')}
            accessibilityRole="search"
            accessibilityLabel="Search artists, venues, people and events"
          >
            <Search size={20} color={SynthTokens.colors.neutral400} />
            <Text style={styles.searchPlaceholder}>Try "Radiohead"</Text>
          </Pressable>
          <LocationPill />
        </View>
        {friendSuggestions.length > 0 ? (
          <FriendSuggestionsRail suggestions={friendSuggestions} />
        ) : null}
      </>
    ),
    [friendSuggestions, router]
  );

  return (
    <View style={styles.container}>
      <FeedHeader
        notificationsCount={notificationCount}
        onMenuPress={() => router.push('/app-menu')}
      />

      {feedLoading ? (
        <View style={styles.skeletonWrap}>
          <FeedListSkeleton />
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={listData}
          renderItem={renderItem}
          extraData={highlights}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={JUST_ANNOUNCED_VIEWABILITY}
          keyExtractor={item =>
            item.kind === 'event' ? `ev-${item.data.id}` : `rv-${item.data.id}`
          }
          ListHeaderComponent={listHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomSafeContentPadding(insets.bottom) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={SynthTokens.colors.brandPink500}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <SynthText variant="meta" color="secondary">
                {emptyMessage}
              </SynthText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  skeletonWrap: {
    flex: 1,
  },
  listContent: {
    paddingTop: SynthTokens.spacing.sm,
  },
  searchWrap: {
    paddingHorizontal: SynthTokens.spacing.screenMarginX,
    marginBottom: SynthTokens.spacing.md,
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: SynthTokens.colors.neutral400,
  },
  empty: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
