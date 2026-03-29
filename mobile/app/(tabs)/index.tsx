import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, RefreshControl, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { FeedHeader, FeedDisplayMode } from '../../src/components/Feed/FeedHeader';
import { EventCard } from '../../src/components/Feed/EventCard';
import { NetworkReviewCard } from '../../src/components/Feed/NetworkReviewCard';
import { SynthText } from '../../src/components/SynthText';
import { FriendSuggestionsRail } from '../../src/components/Feed/FriendSuggestionsRail';
import {
  FriendSuggestion,
  HomeFeedService,
  NetworkReview,
  NetworkEvent,
  TrendingEvent,
  UnifiedPersonalizedEvent,
} from '../../src/services/homeFeedService';
import { NotificationService } from '../../src/services/notificationService';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';

type ListItem =
  | { kind: 'event'; data: UnifiedPersonalizedEvent }
  | { kind: 'review'; data: NetworkReview };

export default function FeedScreen() {
  const router = useRouter();
  const [feedDisplayMode, setFeedDisplayMode] = useState<FeedDisplayMode>('events');
  const [events, setEvents] = useState<UnifiedPersonalizedEvent[]>([]);
  const [reviews, setReviews] = useState<NetworkReview[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [friendSuggestions, setFriendSuggestions] = useState<FriendSuggestion[]>([]);
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([]);
  const [trendingEvents, setTrendingEvents] = useState<TrendingEvent[]>([]);

  const listData: ListItem[] =
    feedDisplayMode === 'events'
      ? events.map(data => ({ kind: 'event', data }))
      : reviews.map(data => ({ kind: 'review', data }));

  const fetchFeed = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const unread = await NotificationService.getUnreadCount(user.id);
      setNotificationCount(unread);

      const suggestions = await HomeFeedService.getFriendSuggestionsForRail(user.id, 5);
      setFriendSuggestions(suggestions);

      const [net, trend] = await Promise.all([
        HomeFeedService.getNetworkEvents(user.id),
        HomeFeedService.getTrendingEvents(),
      ]);
      setNetworkEvents(net.slice(0, 15));
      setTrendingEvents(trend.slice(0, 15));

      if (feedDisplayMode === 'events') {
        const unified = await HomeFeedService.getUnifiedPersonalizedEvents(user.id, 50);
        setEvents(unified);
      } else {
        const networkReviews = await HomeFeedService.getNetworkReviews(user.id, 20);
        setReviews(networkReviews);
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
      if (feedDisplayMode === 'events') setEvents([]);
      else setReviews([]);
      setFriendSuggestions([]);
      setNetworkEvents([]);
      setTrendingEvents([]);
    } finally {
      setRefreshing(false);
    }
  }, [feedDisplayMode]);

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchFeed();
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'review') {
      return (
        <NetworkReviewCard
          review={item.data}
          onPress={
            item.data.event_id ? () => router.push(`/event/${item.data.event_id}`) : undefined
          }
        />
      );
    }

    return (
      <EventCard
        id={item.data.id}
        title={item.data.title}
        artist_name={item.data.artist_name}
        venue_name={item.data.venue_name}
        event_date={item.data.event_date}
        image_url={item.data.image_url}
        cornerLabel={item.data.feedLabel}
        onPress={() => router.push(`/event/${item.data.id}`)}
        onGoingPress={() => router.push(`/event/${item.data.id}`)}
      />
    );
  };

  const emptyMessage =
    feedDisplayMode === 'events'
      ? 'No events yet. Pull to refresh.'
      : 'No reviews from friends yet.';

  return (
    <View style={styles.container}>
      <FeedHeader
        notificationsCount={notificationCount}
        onMenuPress={() => router.push('/app-menu')}
        feedDisplayMode={feedDisplayMode}
        onFeedDisplayModeChange={setFeedDisplayMode}
      />

      {friendSuggestions.length > 0 ? (
        <FriendSuggestionsRail suggestions={friendSuggestions} />
      ) : null}

      {feedDisplayMode === 'events' && networkEvents.length > 0 ? (
        <View style={styles.railSection}>
          <SynthText variant="h2" style={styles.railTitle}>
            From your network
          </SynthText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railScroll}
          >
            {networkEvents.map(ne => (
              <Pressable
                key={`${ne.id}-${ne.friend_id}`}
                style={styles.miniCard}
                onPress={() => router.push(`/event/${ne.id}`)}
              >
                <Image
                  source={
                    ne.image_url
                      ? { uri: ne.image_url }
                      : require('../../assets/placeholder-event.png')
                  }
                  style={styles.miniImage}
                />
                <SynthText variant="meta" numberOfLines={2} style={styles.miniTitle}>
                  {ne.artist_name || ne.title}
                </SynthText>
                <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.miniMeta}>
                  {ne.friend_name} · {ne.action_type === 'going' ? 'Going' : 'Interested'}
                </SynthText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {feedDisplayMode === 'events' && trendingEvents.length > 0 ? (
        <View style={styles.railSection}>
          <SynthText variant="h2" style={styles.railTitle}>
            Trending near you
          </SynthText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railScroll}
          >
            {trendingEvents.map(te => (
              <Pressable
                key={te.id}
                style={styles.miniCard}
                onPress={() => router.push(`/event/${te.id}`)}
              >
                <Image
                  source={
                    te.image_url
                      ? { uri: te.image_url }
                      : require('../../assets/placeholder-event.png')
                  }
                  style={styles.miniImage}
                />
                <SynthText variant="meta" numberOfLines={2} style={styles.miniTitle}>
                  {te.artist_name || te.title}
                </SynthText>
                <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.miniMeta}>
                  {te.interest_count ?? 0} interested
                </SynthText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlashList
        data={listData}
        renderItem={renderItem}
        keyExtractor={item =>
          item.kind === 'event' ? `ev-${item.data.id}` : `rv-${item.data.id}`
        }
        contentContainerStyle={styles.listContent}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  listContent: {
    paddingVertical: SynthTokens.spacing.md,
  },
  empty: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  railSection: {
    marginBottom: SynthTokens.spacing.md,
    paddingHorizontal: SynthTokens.spacing.screenMarginX,
  },
  railTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    color: SynthTokens.colors.neutral900,
  },
  railScroll: { gap: 12, paddingBottom: 4 },
  miniCard: {
    width: 168,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  miniImage: { width: '100%', height: 96, backgroundColor: SynthTokens.colors.neutral100 },
  miniTitle: { paddingHorizontal: 8, paddingTop: 8, fontWeight: '600' },
  miniMeta: { paddingHorizontal: 8, paddingBottom: 8, fontSize: 12 },
});
