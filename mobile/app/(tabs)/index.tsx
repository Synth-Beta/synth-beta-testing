import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { FeedHeader, FeedDisplayMode } from '../../src/components/Feed/FeedHeader';
import { EventCard } from '../../src/components/Feed/EventCard';
import { NetworkReviewCard } from '../../src/components/Feed/NetworkReviewCard';
import { SynthText } from '../../src/components/SynthText';
import { FriendSuggestionsRail } from '../../src/components/Feed/FriendSuggestionsRail';
import { FeedListSkeleton } from '../../src/components/skeletons/FeedListSkeleton';
import { ShareWithFriendsBanner } from '../../src/components/share/ShareWithFriendsBanner';
import {
  FriendSuggestion,
  HomeFeedService,
  NetworkReview,
  UnifiedPersonalizedEvent,
} from '../../src/services/homeFeedService';
import { NotificationService } from '../../src/services/notificationService';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { getCurrentLatLng } from '../../src/services/locationService';
import { EventService } from '../../src/services/eventService';
import { tabBarBottomContentPadding } from '../../src/components/navigation/SynthTabBar';
import { useInterested } from '../../src/contexts/InterestedContext';

type ListItem =
  | { kind: 'event'; data: UnifiedPersonalizedEvent }
  | { kind: 'review'; data: NetworkReview };

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [feedDisplayMode, setFeedDisplayMode] = useState<FeedDisplayMode>('events');
  const [events, setEvents] = useState<UnifiedPersonalizedEvent[]>([]);
  const [reviews, setReviews] = useState<NetworkReview[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [friendSuggestions, setFriendSuggestions] = useState<FriendSuggestion[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const autoRetryFiredRef = useRef(false);
  const { seedFromFeed } = useInterested();

  const listData: ListItem[] =
    feedDisplayMode === 'events'
      ? events.map(data => ({ kind: 'event', data }))
      : reviews.map(data => ({ kind: 'review', data }));

  const fetchFeed = useCallback(async () => {
    try {
      const loc = await getCurrentLatLng();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setReferralCode(null);
        setViewerUserId(null);
        setEvents([]);
        setReviews([]);
        setFriendSuggestions([]);
        return;
      }
      setViewerUserId(user.id);
      const { data: me } = await supabase
        .from('users')
        .select('referral_code')
        .eq('user_id', user.id)
        .maybeSingle();
      setReferralCode((me as any)?.referral_code ?? null);
      const unread = await NotificationService.getUnreadCount(user.id);
      setNotificationCount(unread);

      const suggestions = await HomeFeedService.getFriendSuggestionsForRail(user.id, 5);
      setFriendSuggestions(suggestions);

      if (feedDisplayMode === 'events') {
        const unified = await HomeFeedService.getUnifiedPersonalizedEvents(
          user.id,
          50,
          loc?.latitude ?? null,
          loc?.longitude ?? null,
          50
        );
        setEvents(unified);
        seedFromFeed(unified);
      } else {
        const networkReviews = await HomeFeedService.getNetworkReviews(user.id, 20);
        setReviews(networkReviews);
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
      setReferralCode(null);
      setViewerUserId(null);
      if (feedDisplayMode === 'events') setEvents([]);
      else setReviews([]);
      setFriendSuggestions([]);
    } finally {
      setRefreshing(false);
      setFeedLoading(false);
    }
  }, [feedDisplayMode]);

  const handleFeedDisplayModeChange = useCallback((mode: FeedDisplayMode) => {
    setFeedDisplayMode(mode);
    setFeedLoading(true);
  }, []);

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  // Auto-retry: if events come back empty after the initial load, retry once
  // after 4 seconds. This handles GPS cold-start and RPC warm-up delays where
  // the first call succeeds but returns 0 results.
  useEffect(() => {
    if (feedLoading) return; // still loading, don't schedule
    const isEmpty =
      feedDisplayMode === 'events' ? events.length === 0 : reviews.length === 0;
    if (!isEmpty) {
      autoRetryFiredRef.current = false; // reset when we have data
      return;
    }
    if (autoRetryFiredRef.current) return; // only retry once per empty state
    autoRetryFiredRef.current = true;
    const t = setTimeout(() => {
      void fetchFeed();
    }, 4000);
    return () => clearTimeout(t);
  }, [feedLoading, feedDisplayMode, events.length, reviews.length, fetchFeed]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchFeed();
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'review') {
      return (
        <NetworkReviewCard
          review={item.data}
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
        event_date={item.data.event_date}
        image_url={item.data.image_url}
        cornerLabel={item.data.feedLabel}
        initialInterested={Boolean(item.data.user_is_interested)}
        interested_count={item.data.interested_count}
        ticket_url={item.data.ticket_url}
        artist_id={item.data.artist_id}
        venue_id={item.data.venue_id}
        onPress={() => {
          void EventService.toEventRouteId(item.data.id).then((rid) => {
            router.push(`/event/${rid}` as any);
          });
        }}
      />
    );
  };

  const emptyMessage =
    feedDisplayMode === 'events'
      ? 'No events yet. Pull to refresh.'
      : 'No reviews from friends yet.';

  const listHeader = useMemo(
    () => (
      <>
        <ShareWithFriendsBanner referralCode={referralCode} source="home_feed" />
        {friendSuggestions.length > 0 ? (
          <FriendSuggestionsRail suggestions={friendSuggestions} />
        ) : null}
      </>
    ),
    [referralCode, friendSuggestions]
  );

  return (
    <View style={styles.container}>
      <FeedHeader
        notificationsCount={notificationCount}
        onMenuPress={() => router.push('/app-menu')}
        feedDisplayMode={feedDisplayMode}
        onFeedDisplayModeChange={handleFeedDisplayModeChange}
      />

      {feedLoading ? (
        <View style={styles.skeletonWrap}>
          <FeedListSkeleton />
        </View>
      ) : (
        <FlashList
          data={listData}
          renderItem={renderItem}
          keyExtractor={item =>
            item.kind === 'event' ? `ev-${item.data.id}` : `rv-${item.data.id}`
          }
          ListHeaderComponent={listHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarBottomContentPadding(insets.bottom) },
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
    paddingTop: SynthTokens.spacing.md,
  },
  empty: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
