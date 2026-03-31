import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  FlatList,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { MyEventsService, MyReviewListItem, ProfileUnreviewedItem } from '../src/services/myEventsService';

type ViewMode = 'reviews' | 'rankings' | 'unreviewed';

const PINK = SynthTokens.colors.brandPink500;

export default function MyEventsScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>('reviews');
  const [reviews, setReviews] = useState<MyReviewListItem[]>([]);
  const [unreviewed, setUnreviewed] = useState<ProfileUnreviewedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [r, u] = await Promise.all([
      MyEventsService.getMyReviews(user.id),
      MyEventsService.getProfileUnreviewedQueue(user.id),
    ]);
    setReviews(r);
    setUnreviewed(u);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  React.useEffect(() => {
    if (tab === 'rankings') setViewMode('rankings');
    if (tab === 'reviews') setViewMode('reviews');
    if (tab === 'unreviewed') setViewMode('unreviewed');
  }, [tab]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const groupedByStar = React.useMemo(() => {
    const map = new Map<number, MyReviewListItem[]>();
    for (const rv of reviews) {
      const r = rv.rating != null ? Math.round(rv.rating) : 0;
      const key = Math.min(5, Math.max(1, r));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rv);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.rank_order ?? 999) - (b.rank_order ?? 999));
    }
    return map;
  }, [reviews]);

  const renderReviewCard = (item: MyReviewListItem) => (
    <Pressable
      style={styles.card}
      onPress={() => item.event_id && router.push(`/event/${item.event_id}`)}
    >
      <Image
        source={item.image_url ? { uri: item.image_url } : require('../assets/placeholder-event.png')}
        style={styles.thumb}
      />
      <View style={{ flex: 1 }}>
        <SynthText variant="meta" style={styles.cardTitle} numberOfLines={1}>
          {item.artist_name || item.title}
        </SynthText>
        <SynthText variant="meta" color="secondary" numberOfLines={1}>
          {item.venue_name}
        </SynthText>
        <SynthText variant="meta" color="secondary" style={styles.starLine}>
          {item.rating != null ? `${item.rating.toFixed(1)}★` : ''}
        </SynthText>
      </View>
    </Pressable>
  );

  const reviewComposeHref = (item: ProfileUnreviewedItem) =>
    item.event_id ? `/review-compose?eventId=${item.event_id}` : '/review-compose';

  const renderUnreviewed = (item: ProfileUnreviewedItem) => (
    <View style={styles.card}>
      <Pressable
        style={styles.cardMain}
        onPress={() =>
          item.event_id ? router.push(`/event/${item.event_id}`) : router.push(reviewComposeHref(item))
        }
      >
        <Image
          source={item.image_url ? { uri: item.image_url } : require('../assets/placeholder-event.png')}
          style={styles.thumb}
        />
        <View style={{ flex: 1 }}>
          <SynthText variant="meta" style={styles.cardTitle} numberOfLines={1}>
            {item.artist_name || item.title}
          </SynthText>
          <SynthText variant="meta" color="secondary" numberOfLines={1}>
            {item.kind === 'draft' ? 'Draft · ' : ''}
            {item.venue_name || (item.kind === 'draft' ? 'Finish your review' : '')}
          </SynthText>
        </View>
      </Pressable>
      <Pressable style={styles.miniCta} onPress={() => router.push(reviewComposeHref(item))}>
        <SynthText variant="meta" style={styles.miniCtaText}>
          {item.kind === 'draft' ? 'Continue' : 'Review'}
        </SynthText>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </TouchableOpacity>
        <SynthText variant="h2">My Events</SynthText>
        <View style={styles.back} />
      </View>

      <View style={styles.segment}>
        {(['reviews', 'rankings', 'unreviewed'] as const).map(m => (
          <Pressable
            key={m}
            onPress={() => setViewMode(m)}
            style={[styles.segBtn, viewMode === m && styles.segBtnOn]}
          >
            <SynthText variant="meta" style={[styles.segTxt, viewMode === m && styles.segTxtOn]}>
              {m === 'reviews' ? 'Reviews' : m === 'rankings' ? 'Rankings' : 'Unreviewed'}
            </SynthText>
          </Pressable>
        ))}
      </View>

      {viewMode === 'reviews' ? (
        <FlatList
          data={reviews}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PINK} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? (
              <SynthText variant="body" color="secondary" style={styles.empty}>
                No reviews yet. Attend a show and write one from the event page.
              </SynthText>
            ) : null
          }
          renderItem={({ item }) => renderReviewCard(item)}
        />
      ) : viewMode === 'rankings' ? (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PINK} />}
        >
          {reviews.length === 0 && !loading ? (
            <SynthText variant="body" color="secondary" style={styles.empty}>
              No ranked reviews yet.
            </SynthText>
          ) : (
            Array.from(groupedByStar.entries())
              .sort((a, b) => b[0] - a[0])
              .map(([star, items]) => (
                <View key={star}>
                  <SynthText variant="meta" style={styles.groupHeader}>
                    {star}★ reviews ({items.length})
                  </SynthText>
                  {items.map(r => (
                    <View key={r.id}>{renderReviewCard(r)}</View>
                  ))}
                </View>
              ))
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={unreviewed}
          keyExtractor={i => `${i.kind}-${i.reviewId}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PINK} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? (
              <SynthText variant="body" color="secondary" style={styles.empty}>
                No unreviewed past shows. You are all caught up.
              </SynthText>
            ) : null
          }
          renderItem={({ item }) => renderUnreviewed(item)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: SynthTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  segment: {
    flexDirection: 'row',
    margin: SynthTokens.spacing.md,
    backgroundColor: SynthTokens.colors.neutral200,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segBtnOn: { backgroundColor: SynthTokens.colors.neutral900 },
  segTxt: { fontWeight: '700', color: SynthTokens.colors.neutral600 },
  segTxtOn: { color: SynthTokens.colors.neutral0 },
  list: { paddingHorizontal: SynthTokens.spacing.md, paddingBottom: 48 },
  empty: { marginTop: 24, textAlign: 'center' },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  cardTitle: { fontWeight: '800' },
  starLine: { marginTop: 4 },
  groupHeader: { fontWeight: '800', marginTop: 16, marginBottom: 8, fontSize: 15 },
  miniCta: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: PINK,
  },
  miniCtaText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
