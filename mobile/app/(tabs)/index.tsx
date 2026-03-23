import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { FeedHeader } from '../../src/components/Feed/FeedHeader';
import { FilterPills, FeedFilter } from '../../src/components/Feed/FilterPills';
import { EventCard } from '../../src/components/Feed/EventCard';
import { FriendActivityCard } from '../../src/components/Feed/FriendActivityCard';
import { SynthText } from '../../src/components/SynthText';
import { HomeFeedService, NetworkEvent, TrendingEvent } from '../../src/services/homeFeedService';
import { NotificationService } from '../../src/services/notificationService';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';

type FeedItem =
  | { type: 'network', data: NetworkEvent }
  | { type: 'trending', data: TrendingEvent };

export default function FeedScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('For You');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeed = useCallback(async (filter: FeedFilter) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const unread = await NotificationService.getUnreadCount(user.id);
      setNotificationCount(unread);

      let feedItems: FeedItem[] = [];

      if (filter === 'For You' || filter === 'Following') {
        const networkEvents = await HomeFeedService.getNetworkEvents(user.id);
        feedItems = networkEvents.map(ev => ({ type: 'network', data: ev }));
      } else {
        const trendingEvents = await HomeFeedService.getTrendingEvents();
        feedItems = trendingEvents.map(ev => ({ type: 'trending', data: ev }));
      }

      setItems(feedItems);
    } catch (error) {
      console.error('Error fetching feed:', error);
      setItems([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed(activeFilter);
  }, [activeFilter, fetchFeed]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed(activeFilter);
  };

  const renderItem = ({ item }: { item: FeedItem }) => {
    if (item.type === 'network') {
      return (
        <FriendActivityCard
          activity={item.data}
          onPress={() => router.push(`/event/${item.data.id}`)}
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
        onPress={() => router.push(`/event/${item.data.id}`)}
        onGoingPress={() => router.push(`/event/${item.data.id}`)}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FeedHeader notificationsCount={notificationCount} onMenuPress={() => router.push('/notifications')} />
      <FilterPills
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.data.id}`}
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
            <SynthText variant="meta" color="secondary">No events yet. Pull to refresh or switch filter.</SynthText>
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
  }
});
