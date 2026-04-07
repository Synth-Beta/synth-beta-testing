import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { supabase, isSupabaseConfigured } from '../../integrations/supabase/client';
import {
  MyEventsService,
  MyReviewListItem,
  ProfileUnreviewedItem,
} from '../../services/myEventsService';
import { setRankOrderForRatingGroup } from '../../services/reviewRankOrderService';
import {
  buildRankingsGroups,
  getDisplayRating,
  groupReviewsIntoStarBuckets,
  hasAnyStarBucketContent,
  type StarBucket,
} from '../../utils/profileReviewGrouping';

const PINK = SynthTokens.colors.brandPink500;

export type ProfileMyEventsViewMode = 'reviews' | 'rankings' | 'unreviewed';

export type ProfileMyEventsPanelHandle = {
  reload: () => Promise<void>;
};

type Props = {
  variant: 'embedded' | 'screen';
  /** When set, skips auth lookup for loading data (own profile). */
  userId?: string | null;
  showDraftsBanner?: boolean;
  /** Deep link tab from `my-events?tab=` */
  routeTab?: string;
  /** Extra bottom inset when embedded inside a tab screen. */
  contentBottomPadding?: number;
  /** Dedicated My Events screen already shows title in the nav header. */
  hideTitleBlock?: boolean;
};

const STAR_SECTIONS: Array<{ stars: StarBucket; label: string }> = [
  { stars: 5, label: '5 Star Reviews' },
  { stars: 4, label: '4 Star Reviews' },
  { stars: 3, label: '3 Star Reviews' },
  { stars: 2, label: '2 Star Reviews' },
  { stars: 1, label: '1 Star Reviews' },
];

function HalfStarDisplay({ rating }: { rating: number }) {
  const rounded = Math.floor(rating * 2) / 2;
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(i => {
        const full = rounded >= i;
        const half = !full && rounded >= i - 0.5;
        return (
          <View key={i} style={styles.starSlot}>
            <Text style={[styles.starGlyph, !full && !half && styles.starEmpty]} maxFontSizeMultiplier={1.2}>
              ★
            </Text>
            {half ? (
              <View style={styles.starHalfMask}>
                <Text style={styles.starGlyph} maxFontSizeMultiplier={1.2}>
                  ★
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export const ProfileMyEventsPanel = forwardRef<ProfileMyEventsPanelHandle, Props>(
  function ProfileMyEventsPanel(
    {
      variant,
      userId: userIdProp,
      showDraftsBanner = true,
      routeTab,
      contentBottomPadding = 0,
      hideTitleBlock = false,
    },
    ref
  ) {
    const router = useRouter();
    const [mode, setMode] = useState<ProfileMyEventsViewMode>('reviews');
    const [reviews, setReviews] = useState<MyReviewListItem[]>([]);
    const [reviewsLoadError, setReviewsLoadError] = useState<string | null>(null);
    const [unreviewed, setUnreviewed] = useState<ProfileUnreviewedItem[]>([]);
    const [draftCount, setDraftCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeUserId, setActiveUserId] = useState<string | null>(null);
    const [rankSaving, setRankSaving] = useState(false);

    const load = useCallback(async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      const uid =
        userIdProp ??
        (await supabase.auth.getUser()).data.user?.id ??
        null;
      if (!uid) {
        setLoading(false);
        setRefreshing(false);
        setActiveUserId(null);
        return;
      }
      setActiveUserId(uid);
      const [r, u, d] = await Promise.all([
        MyEventsService.getMyReviews(uid),
        MyEventsService.getProfileUnreviewedQueue(uid),
        MyEventsService.countDraftReviews(uid),
      ]);
      setReviews(r.items);
      setReviewsLoadError(r.error);
      if (__DEV__) {
        console.debug('[ProfileMyEventsPanel] getMyReviews result', {
          uid,
          isSupabaseConfigured,
          itemCount: r.items.length,
          error: r.error,
        });
      }
      setUnreviewed(u);
      setDraftCount(d);
      setLoading(false);
      setRefreshing(false);
    }, [userIdProp]);

    useImperativeHandle(ref, () => ({ reload: () => load({ silent: true }) }), [load]);

    useEffect(() => {
      void load();
    }, [load]);

    useEffect(() => {
      if (routeTab === 'rankings') setMode('rankings');
      if (routeTab === 'reviews') setMode('reviews');
      if (routeTab === 'unreviewed') setMode('unreviewed');
    }, [routeTab]);

    const onRefresh = useCallback(() => {
      setRefreshing(true);
      void load({ silent: true });
    }, [load]);

    const starGrouped = useMemo(() => groupReviewsIntoStarBuckets(reviews), [reviews]);
    const rankingsGroups = useMemo(() => buildRankingsGroups(reviews), [reviews]);

    useEffect(() => {
      if (loading) return;
      if (reviews.length > 0 && !hasAnyStarBucketContent(starGrouped)) {
        console.warn('[ProfileMyEventsPanel] reviews loaded but no star bucket content', {
          count: reviews.length,
        });
      }
    }, [loading, reviews.length, starGrouped]);

    const reviewComposeHref = (item: ProfileUnreviewedItem) =>
      item.event_id ? `/review-compose?eventId=${item.event_id}` : '/review-compose';

    const openReview = useCallback(
      (id: string) => {
        router.push(`/review/${id}` as any);
      },
      [router]
    );

    const moveInGroup = useCallback(
      async (ratingKey: number, items: MyReviewListItem[], index: number, dir: 'up' | 'down') => {
        if (!activeUserId || rankSaving) return;
        const arr = items.slice();
        const i = index;
        if (dir === 'up' && i > 0) {
          const t = arr[i - 1];
          arr[i - 1] = arr[i];
          arr[i] = t;
        } else if (dir === 'down' && i < arr.length - 1) {
          const t = arr[i + 1];
          arr[i + 1] = arr[i];
          arr[i] = t;
        } else {
          return;
        }
        setRankSaving(true);
        try {
          await setRankOrderForRatingGroup(activeUserId, ratingKey, arr.map(x => x.id));
          await load({ silent: true });
        } catch (e) {
          console.warn('[ProfileMyEventsPanel] rank save failed', e);
        } finally {
          setRankSaving(false);
        }
      },
      [activeUserId, rankSaving, load]
    );

    const renderCompactReviewCard = (item: MyReviewListItem, starsFallback: number) => {
      const rv = getDisplayRating(item) ?? starsFallback;
      return (
        <Pressable
          style={styles.compactCard}
          onPress={() => openReview(item.id)}
        >
          <Image
            source={item.image_url ? { uri: item.image_url } : require('../../../assets/Synth_Placeholder.png')}
            style={styles.compactImage}
          />
          <View style={styles.compactBody}>
            <SynthText variant="meta" style={styles.compactTitle} numberOfLines={2}>
              {item.artist_name || item.title}
            </SynthText>
            <SynthText variant="meta" color="secondary" numberOfLines={1}>
              {item.venue_name}
            </SynthText>
            {rv > 0 ? (
              <View style={styles.compactRatingRow}>
                <HalfStarDisplay rating={rv} />
                <SynthText variant="meta" color="secondary" style={styles.compactStarNum}>
                  {Math.round(rv * 10) / 10}★
                </SynthText>
              </View>
            ) : (
              <SynthText variant="meta" color="secondary" style={styles.noRatingLbl}>
                No rating
              </SynthText>
            )}
          </View>
        </Pressable>
      );
    };

    const renderUnreviewedRow = (item: ProfileUnreviewedItem) => (
      <View style={styles.unrevRow}>
        <Pressable
          style={styles.unrevMain}
          onPress={() =>
            item.event_id
              ? router.push(`/event/${item.event_id}` as any)
              : router.push(reviewComposeHref(item) as any)
          }
        >
          <Image
            source={
              item.image_url
                ? { uri: item.image_url }
                : require('../../../assets/Synth_Placeholder.png')
            }
            style={styles.unrevThumb}
          />
          <View style={{ flex: 1 }}>
            <SynthText variant="meta" style={styles.unrevTitle} numberOfLines={1}>
              {item.artist_name || item.title}
            </SynthText>
            <SynthText variant="meta" color="secondary" numberOfLines={1}>
              {item.kind === 'draft' ? 'Draft · ' : ''}
              {item.venue_name || (item.kind === 'draft' ? 'Finish your review' : '')}
            </SynthText>
          </View>
        </Pressable>
        <Pressable
          style={styles.miniCta}
          onPress={() => router.push(reviewComposeHref(item) as any)}
        >
          <SynthText variant="meta" style={styles.miniCtaTxt}>
            {item.kind === 'draft' ? 'Continue' : 'Review'}
          </SynthText>
        </Pressable>
      </View>
    );

    const segment = (
      <View style={[styles.segment, variant === 'screen' && styles.segmentScreen]}>
        {(['reviews', 'rankings', 'unreviewed'] as const).map(m => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.segBtn, mode === m && styles.segBtnOn]}
          >
            <Text style={[styles.segTxt, mode === m && styles.segTxtOn]}>
              {m === 'reviews' ? 'Reviews' : m === 'rankings' ? 'Rankings' : 'Unreviewed'}
            </Text>
          </Pressable>
        ))}
      </View>
    );

    const titleBlock = hideTitleBlock ? null : (
      <View style={styles.titleBlock}>
        <SynthText variant="h2" style={styles.myEventsTitle}>
          My Events
        </SynthText>
        <SynthText variant="meta" color="secondary" style={styles.viewModeLbl}>
          View mode:
        </SynthText>
      </View>
    );

    const draftsBanner =
      showDraftsBanner && draftCount > 0 ? (
        <Pressable style={styles.draftsBanner} onPress={() => setMode('unreviewed')}>
          <View style={styles.draftsBannerInner}>
            <View style={{ flex: 1 }}>
              <SynthText variant="meta" style={styles.draftsKicker}>
                DRAFTS
              </SynthText>
            <Text style={styles.draftsCount}>
              {draftCount} in progress
            </Text>
              <SynthText variant="meta" style={styles.draftsSub}>
                Tap to jump into your unreviewed shows and drafts.
              </SynthText>
            </View>
            <View style={styles.draftsPills}>
              <View style={styles.pillPink}>
                <SynthText variant="meta" style={styles.pillPinkTxt}>
                  Keep the streak
                </SynthText>
              </View>
              <View style={styles.pillMuted}>
                <SynthText variant="meta" style={styles.pillMutedTxt}>
                  Autosave on
                </SynthText>
              </View>
            </View>
          </View>
        </Pressable>
      ) : null;

    let body: React.ReactNode = null;

    if (loading) {
      body = (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={PINK} />
        </View>
      );
    } else if (mode === 'reviews') {
      if (reviewsLoadError) {
        body = (
          <SynthText variant="body" color="secondary" style={styles.emptyCopy}>
            {__DEV__ ? (
              <>
                Couldn&apos;t load reviews ({reviewsLoadError}).{' '}
                {!isSupabaseConfigured
                  ? 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the same values as the web app (.env / Vite).'
                  : 'Confirm you are signed in as the same user as on web.'}
              </>
            ) : (
              <>Couldn&apos;t load reviews. Pull to refresh or try again.</>
            )}
          </SynthText>
        );
      } else if (reviews.length === 0) {
        body = (
          <SynthText variant="body" color="secondary" style={styles.emptyCopy}>
            No reviews yet. Attend a show and write one from the event page.
          </SynthText>
        );
      } else if (!hasAnyStarBucketContent(starGrouped)) {
        body = (
          <SynthText variant="body" color="secondary" style={styles.emptyCopy}>
            Something went wrong displaying reviews. Try pull to refresh; if it persists, report a bug.
          </SynthText>
        );
      } else {
        body = (
          <View style={styles.bucketsWrap}>
            {STAR_SECTIONS.map(({ stars, label }) => {
              const bucket = starGrouped.buckets[stars];
              if (!bucket?.length) return null;
              return (
                <View key={stars} style={styles.bucketSection}>
                  <SynthText variant="meta" style={styles.bucketHeading}>
                    {label}{' '}
                    <Text style={styles.bucketCount}>({bucket.length})</Text>
                  </SynthText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                    {bucket.map(item => (
                      <View key={item.id} style={styles.carouselItem}>
                        {renderCompactReviewCard(item, stars)}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              );
            })}
            {starGrouped.unrated.length > 0 ? (
              <View style={styles.bucketSection}>
                <SynthText variant="meta" style={styles.bucketHeading}>
                  Unrated Reviews{' '}
                  <Text style={styles.bucketCount}>({starGrouped.unrated.length})</Text>
                </SynthText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                  {starGrouped.unrated.map(item => (
                    <View key={item.id} style={styles.carouselItem}>
                      {renderCompactReviewCard(item, 0)}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        );
      }
    } else if (mode === 'rankings') {
      if (reviewsLoadError) {
        body = (
          <SynthText variant="body" color="secondary" style={styles.emptyCopy}>
            {__DEV__
              ? `Couldn't load reviews (${reviewsLoadError}). Pull to refresh or try again.`
              : `Couldn't load reviews. Pull to refresh or try again.`}
          </SynthText>
        );
      } else if (reviews.length === 0) {
        body = (
          <SynthText variant="body" color="secondary" style={styles.emptyCopy}>
            No reviews yet. Attend a show and write one from the event page.
          </SynthText>
        );
      } else if (rankingsGroups.length === 0) {
        body = (
          <SynthText variant="body" color="secondary" style={styles.emptyCopy}>
            No star ratings to rank yet. Complete a review with ratings to organize shows here.
          </SynthText>
        );
      } else {
        body = (
          <View style={styles.rankingsWrap}>
            {rankingsGroups.map(({ ratingKey, items }) => (
              <View key={ratingKey} style={styles.rankGroup}>
                <SynthText variant="meta" style={styles.rankGroupTitle}>
                  {ratingKey.toFixed(1)}★
                </SynthText>
                <View style={styles.rankList}>
                  {items.map((item, idx) => (
                    <View key={item.id} style={styles.rankRow}>
                      <Pressable
                        style={styles.rankRowMain}
                        onPress={() => openReview(item.id)}
                      >
                        <View style={styles.rankBadge}>
                          <Text style={styles.rankBadgeTxt}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <SynthText variant="meta" style={styles.rankEventTitle} numberOfLines={2}>
                            {item.artist_name || item.title}
                          </SynthText>
                          <SynthText variant="meta" color="secondary" numberOfLines={1}>
                            {item.venue_name}
                          </SynthText>
                        </View>
                      </Pressable>
                      <View style={styles.rankArrows}>
                        {idx > 0 ? (
                          <Pressable
                            hitSlop={8}
                            disabled={rankSaving}
                            onPress={() => void moveInGroup(ratingKey, items, idx, 'up')}
                          >
                            <ChevronUp size={22} color={SynthTokens.colors.neutral600} />
                          </Pressable>
                        ) : (
                          <View style={{ width: 22 }} />
                        )}
                        {idx < items.length - 1 ? (
                          <Pressable
                            hitSlop={8}
                            disabled={rankSaving}
                            onPress={() => void moveInGroup(ratingKey, items, idx, 'down')}
                          >
                            <ChevronDown size={22} color={SynthTokens.colors.neutral600} />
                          </Pressable>
                        ) : (
                          <View style={{ width: 22 }} />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        );
      }
    } else {
      body =
        unreviewed.length === 0 ? (
          <View style={styles.caughtUp}>
            <SynthText variant="h2" style={styles.caughtUpTitle}>
              All Caught Up!
            </SynthText>
            <SynthText variant="body" color="secondary" style={styles.caughtUpBody}>
              {"You've reviewed all the events you've attended and have no draft reviews. Great job!"}
            </SynthText>
          </View>
        ) : (
          <View style={styles.unrevList}>
            {unreviewed.map(item => (
              <View key={`${item.kind}-${item.reviewId}`}>{renderUnreviewedRow(item)}</View>
            ))}
          </View>
        );
    }

    const inner = (
      <View
        style={[
          styles.inner,
          variant === 'embedded' && styles.innerEmbedded,
          variant === 'screen' && styles.innerScreen,
          { paddingBottom: contentBottomPadding },
        ]}
      >
        {hideTitleBlock ? (
          <SynthText variant="meta" color="secondary" style={styles.viewModeLbl}>
            View mode:
          </SynthText>
        ) : (
          titleBlock
        )}
        {draftsBanner}
        {segment}
        {body}
      </View>
    );

    if (variant === 'screen') {
      return (
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.screenScrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PINK} />}
        >
          {inner}
        </ScrollView>
      );
    }

    return inner;
  }
);

const styles = StyleSheet.create({
  inner: { gap: 12 },
  innerEmbedded: { marginTop: 4 },
  innerScreen: { paddingHorizontal: SynthTokens.spacing.md },
  titleBlock: { gap: 6 },
  myEventsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  viewModeLbl: { fontSize: 14 },
  segment: {
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  segmentScreen: {
    backgroundColor: SynthTokens.colors.neutral200,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segBtnOn: { backgroundColor: SynthTokens.colors.neutral900 },
  segTxt: { fontWeight: '700', fontSize: 12, color: SynthTokens.colors.neutral600 },
  segTxtOn: { color: SynthTokens.colors.neutral0 },
  draftsBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SynthTokens.colors.neutral900,
  },
  draftsBannerInner: {
    padding: SynthTokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  draftsKicker: {
    color: 'rgba(255, 182, 193, 0.95)',
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  draftsCount: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
    fontFamily: SynthTokens.typography.fontFamily.bold,
  },
  draftsSub: { color: 'rgba(255, 230, 240, 0.9)', marginTop: 6, fontSize: 12 },
  draftsPills: { alignItems: 'flex-end', gap: 6 },
  pillPink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(236, 72, 153, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(251, 207, 232, 0.5)',
  },
  pillPinkTxt: { color: 'rgba(255, 228, 240, 0.95)', fontSize: 10 },
  pillMuted: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pillMutedTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 10 },
  loadingBox: { paddingVertical: 24, alignItems: 'center' },
  emptyCopy: { lineHeight: 22, marginTop: 4 },
  bucketsWrap: { gap: 20 },
  bucketSection: { gap: 8 },
  bucketHeading: { fontWeight: '800', fontSize: 15, color: SynthTokens.colors.neutral900 },
  bucketCount: { fontWeight: '500', color: SynthTokens.colors.neutral600, fontSize: 14 },
  carousel: { gap: 12, paddingVertical: 4 },
  carouselItem: { width: 160 },
  compactCard: {
    width: 160,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    overflow: 'hidden',
  },
  compactImage: { width: '100%', height: 80, backgroundColor: SynthTokens.colors.neutral100 },
  compactBody: { padding: 10, gap: 4 },
  compactTitle: { fontWeight: '800', fontSize: 13, minHeight: 36 },
  compactRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  compactStarNum: { fontSize: 11, fontWeight: '700' },
  noRatingLbl: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  starRow: { flexDirection: 'row', gap: 1, alignItems: 'center' },
  starSlot: { width: 12, height: 12, position: 'relative' },
  starGlyph: { fontSize: 10, color: '#facc15', lineHeight: 12 },
  starEmpty: { color: '#d1d5db' },
  starHalfMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 6,
    height: 12,
    overflow: 'hidden',
  },
  rankingsWrap: { gap: 16 },
  rankGroup: { gap: 8 },
  rankGroupTitle: {
    fontWeight: '700',
    color: SynthTokens.colors.neutral600,
    fontSize: 15,
  },
  rankList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral50,
    overflow: 'hidden',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  rankRowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
  },
  rankBadgeTxt: { fontWeight: '700', fontSize: 13, color: SynthTokens.colors.neutral900 },
  rankEventTitle: { fontWeight: '700', fontSize: 14 },
  rankArrows: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unrevRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  unrevMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  unrevThumb: { width: 56, height: 56, borderRadius: 10 },
  unrevTitle: { fontWeight: '800' },
  miniCta: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: PINK,
  },
  miniCtaTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  unrevList: { paddingBottom: 24 },
  caughtUp: { paddingVertical: 24, alignItems: 'center', gap: 12 },
  caughtUpTitle: { fontWeight: '700', textAlign: 'center' },
  caughtUpBody: { textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
  screenScroll: { flex: 1 },
  screenScrollContent: { paddingBottom: 48 },
});
