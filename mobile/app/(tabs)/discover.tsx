import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Text, Image, RefreshControl } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Menu } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { bottomSafeContentPadding } from '../../src/components/navigation/SynthTabBar';
import { ThreadReviewCard } from '../../src/components/Feed/ThreadReviewCard';
import { InviteFriendsButton } from '../../src/components/invite/InviteFriendsCard';
import { supabase } from '../../src/integrations/supabase/client';
import { ReviewEngagementService } from '../../src/services/reviewEngagementService';
import type { NetworkReview } from '../../src/services/homeFeedService';

const PICK5_LOGO = require('../../assets/images/pick5-logo-mark.png');
const REVIEW_LIMIT = 24;

/** Recent public reviews from everyone on Synth (same query as web ConnectionsHub). */
async function loadCommunityReviews(): Promise<NetworkReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, user_id, event_id, rating, review_text, photos, created_at, artist_id, venue_id, likes_count, comments_count, "Event_date"')
    .or('is_public.eq.true,is_public.is.null')
    .or('is_draft.eq.false,is_draft.is.null')
    .or('review_text.is.null,review_text.neq.ATTENDANCE_ONLY')
    .order('created_at', { ascending: false })
    .limit(REVIEW_LIMIT);
  if (error) {
    console.warn('[Community] reviews:', error.message);
    return [];
  }
  const rows = (data ?? []) as any[];
  const ids = (key: string) => [...new Set(rows.map((r) => r[key]).filter(Boolean))] as string[];
  const [userIds, artistIds, venueIds] = [ids('user_id'), ids('artist_id'), ids('venue_id')];
  const [users, artists, venues] = await Promise.all([
    userIds.length ? supabase.from('users').select('user_id, name, avatar_url').in('user_id', userIds) : Promise.resolve({ data: [] as any[] }),
    artistIds.length ? supabase.from('artists').select('id, name, image_url').in('id', artistIds) : Promise.resolve({ data: [] as any[] }),
    venueIds.length ? supabase.from('venues').select('id, name').in('id', venueIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const userById = new Map((users.data ?? []).map((u: any) => [u.user_id, u]));
  const artistById = new Map((artists.data ?? []).map((a: any) => [a.id, a]));
  const venueById = new Map((venues.data ?? []).map((v: any) => [v.id, v.name as string]));

  return rows
    .filter((r) => String(r.review_text ?? '').trim().length > 0 || r.rating != null)
    .map((r) => {
      const user = userById.get(r.user_id) as any;
      const artist = artistById.get(r.artist_id) as any;
      return {
        id: String(r.id),
        event_id: r.event_id ?? undefined,
        artist_id: r.artist_id ?? undefined,
        venue_id: r.venue_id ?? undefined,
        author: { id: r.user_id, name: user?.name || 'Synth member', avatar_url: user?.avatar_url || undefined },
        created_at: r.created_at,
        rating: r.rating != null ? Number(r.rating) : undefined,
        content: String(r.review_text ?? '').trim() || undefined,
        photos: r.photos ?? undefined,
        artist_image_url: artist?.image_url || undefined,
        event_info: {
          artist_name: artist?.name,
          venue_name: r.venue_id ? venueById.get(r.venue_id) : undefined,
          event_date: r.Event_date ?? undefined,
        },
        likes_count: r.likes_count ?? 0,
        comments_count: r.comments_count ?? 0,
        connection_degree: 2 as const,
      };
    });
}

/** Community: Pick5 linking + recent public reviews from everyone on Synth. Mirrors web. */
export default function CommunityScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<NetworkReview>>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<NetworkReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: { session } }, list] = await Promise.all([supabase.auth.getSession(), loadCommunityReviews()]);
    const viewerId = session?.user?.id ?? null;
    // Without this every heart rendered empty, so re-tapping a liked review showed a phantom +1.
    const likedIds = viewerId
      ? await ReviewEngagementService.getReviewIdsLikedByUser(viewerId, list.map((r) => r.id)).catch(() => new Set<string>())
      : new Set<string>();
    setUserId(viewerId);
    setReviews(list.map((r) => ({ ...r, is_liked_by_user: likedIds.has(r.id) })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  // Community tab tap: scroll to top and refresh.
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      onRefresh();
    });
    return unsub;
  }, [navigation, onRefresh]);

  const header = (
    <View style={styles.headerBlock}>
      {/* Two compact actions; the full Pick5 connect flow lives in settings. */}
      <View style={styles.quickRow}>
        <Pressable
          style={styles.pick5Pill}
          onPress={() => router.push('/settings/pickfive')}
          accessibilityRole="button"
          accessibilityLabel="Pick5"
        >
          <Image source={PICK5_LOGO} style={styles.pick5Logo} />
          <Text style={styles.pick5Name}>Pick5</Text>
        </Pressable>
        <InviteFriendsButton userId={userId} />
      </View>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>The community</Text>
        <SynthText variant="meta" color="secondary" style={styles.bannerSub}>
          What people on Synth are saying about the shows they went to. Tap one to read it and join in.
        </SynthText>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Community</Text>
        <Pressable style={styles.iconCircle} onPress={() => router.push('/app-menu')} accessibilityLabel="Open menu">
          <Menu size={22} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>
      <FlashList
        ref={listRef}
        data={reviews}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <ThreadReviewCard
            review={item}
            currentUserId={userId}
            label="Review"
            onPress={() => router.push(`/review/${item.id}` as any)}
          />
        )}
        ListEmptyComponent={
          <SynthText variant="meta" color="secondary" style={styles.empty}>
            {loading ? 'Loading reviews…' : 'No public reviews yet.'}
          </SynthText>
        }
        contentContainerStyle={{ paddingBottom: bottomSafeContentPadding(insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={SynthTokens.colors.neutral400}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.md,
    paddingTop: SynthTokens.spacing.sm,
    paddingBottom: SynthTokens.spacing.sm,
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: SynthTokens.colors.neutral900 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
  },
  headerBlock: { paddingHorizontal: SynthTokens.spacing.screenMarginX, gap: 16, marginBottom: 12 },
  quickRow: { flexDirection: 'row', gap: 10 },
  pick5Pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  pick5Logo: { width: 24, height: 24, borderRadius: 6 },
  pick5Name: { fontSize: 15, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  banner: { paddingTop: 4 },
  bannerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: SynthTokens.colors.neutral900 },
  bannerSub: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  empty: { textAlign: 'center', paddingVertical: 32 },
});
