import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Share,
  Text,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Share2, Star, Users } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventCard } from '../../src/components/Feed/EventCard';
import { ArtistScreenSkeleton } from '../../src/components/skeletons/ArtistScreenSkeleton';
import { EventService } from '../../src/services/eventService';
import { ArtistFollowService } from '../../src/services/artistFollowService';
import { isUuid } from '../../src/utils/isUuid';
import { todayLocalYmd } from '../../src/utils/localYmd';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../../src/utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../../src/utils/eventTicketUrl';

const PINK = SynthTokens.colors.brandPink500;

interface EventRow {
  id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  venue_city?: string;
  event_date: string;
  image_url?: string;
  artist_id?: string;
  venue_id?: string;
  ticket_url?: string;
}

interface ReviewRow {
  id: string;
  user_id: string;
  rating?: number | null;
  review_text?: string | null;
  created_at: string;
  event_id?: string | null;
  users?: { id: string; name: string; avatar_url?: string | null }[] | null;
  events?: {
    id: string;
    title?: string | null;
    artist_name?: string | null;
    venue_name?: string | null;
    event_date?: string | null;
  }[] | null;
}

function mapEventRow(e: any, artistName: string): EventRow {
  const rawImg = pickFeedImageUrlFromPayload(e) ?? e.images?.[0]?.url;
  return {
    id: e.id,
    title: e.title || 'Event',
    artist_name: e.artist_name || artistName,
    venue_name: e.venue_name || '',
    venue_city: e.venue_city ?? undefined,
    event_date: e.event_date,
    image_url: resolveFeedImageUri(rawImg) ?? undefined,
    artist_id: e.artist_id != null ? String(e.artist_id) : undefined,
    venue_id: e.venue_id != null ? String(e.venue_id) : undefined,
    ticket_url: getCompliantEventLinkFromPayload(e) ?? undefined,
  };
}

function ReviewItem({ review }: { review: ReviewRow }) {
  const user = Array.isArray(review.users) ? review.users[0] : null;
  const ev = Array.isArray(review.events) ? review.events[0] : null;
  const authorName = user?.name || 'User';
  const avatarUrl = user?.avatar_url;
  const initials = authorName.charAt(0).toUpperCase();
  const rating = typeof review.rating === 'number' ? review.rating : null;
  const text = review.review_text?.trim() || null;
  const eventTitle =
    ev?.title?.trim() ||
    ev?.artist_name?.trim() ||
    null;

  return (
    <View style={reviewStyles.row}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={reviewStyles.avatar} />
      ) : (
        <View style={[reviewStyles.avatar, reviewStyles.avatarFallback]}>
          <Text style={reviewStyles.avatarLetter}>{initials}</Text>
        </View>
      )}
      <View style={reviewStyles.body}>
        <View style={reviewStyles.nameRow}>
          <SynthText variant="meta" style={reviewStyles.name}>{authorName}</SynthText>
          {rating != null ? (
            <View style={reviewStyles.ratingPill}>
              <Star size={11} color={SynthTokens.colors.neutral0} fill={SynthTokens.colors.neutral0} />
              <Text style={reviewStyles.ratingText}>{rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
        {eventTitle ? (
          <SynthText variant="meta" color="secondary" numberOfLines={1} style={reviewStyles.eventLine}>
            {eventTitle}
          </SynthText>
        ) : null}
        {text ? (
          <SynthText variant="meta" color="secondary" numberOfLines={3} style={reviewStyles.quote}>
            &ldquo;{text}&rdquo;
          </SynthText>
        ) : null}
      </View>
    </View>
  );
}

const reviewStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '700',
    fontSize: 15,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F5A623',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  ratingText: {
    color: SynthTokens.colors.neutral0,
    fontSize: 11,
    fontWeight: '700',
  },
  eventLine: {
    fontSize: 12,
  },
  quote: {
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 2,
  },
});

export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([]);
  const [pastEvents, setPastEvents] = useState<EventRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const raw = String(id);
      let resolvedId: string | null = null;
      let artist: any = null;

      if (isUuid(raw)) {
        resolvedId = raw;
        const { data } = await supabase
          .from('artists')
          .select('id, name, image_url, genres')
          .eq('id', raw)
          .maybeSingle();
        artist = data;
      } else {
        resolvedId = await EventService.resolveCanonicalArtistId(raw);
        if (resolvedId) {
          const { data } = await supabase
            .from('artists')
            .select('id, name, image_url, genres')
            .eq('id', resolvedId)
            .maybeSingle();
          artist = data;
        } else {
          const { data } = await supabase
            .from('artists')
            .select('id, name, image_url, genres')
            .ilike('name', raw)
            .maybeSingle();
          artist = data;
          resolvedId = data?.id ?? null;
        }
      }

      const artistName = artist?.name?.trim() || 'Artist';
      if (artist) {
        setName(artistName);
        setImageUrl(artist.image_url || null);
        setArtistId(resolvedId);
        setGenres(Array.isArray(artist.genres) ? artist.genres : []);
      } else {
        setName('Artist');
        setImageUrl(null);
        setArtistId(null);
        setGenres([]);
      }

      const { data: { user } } = await supabase.auth.getUser();
      setSessionUserId(user?.id ?? null);

      if (resolvedId) {
        // Upcoming events
        const today = todayLocalYmd();
        const { data: upcomingData } = await supabase
          .from('events')
          .select('id, title, artist_name, artist_id, venue_id, venue_name, venue_city, event_date, images, ticket_urls')
          .eq('artist_id', resolvedId)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(25);
        setUpcomingEvents((upcomingData || []).map(e => mapEventRow(e, artistName)));

        // Past events
        const { data: pastData } = await supabase
          .from('events')
          .select('id, title, artist_name, artist_id, venue_id, venue_name, venue_city, event_date, images, ticket_urls')
          .eq('artist_id', resolvedId)
          .lt('event_date', today)
          .order('event_date', { ascending: false })
          .limit(10);
        setPastEvents((pastData || []).map(e => mapEventRow(e, artistName)));

        // Reviews
        const { data: reviewData } = await supabase
          .from('reviews')
          .select(`
            id, user_id, rating, review_text, created_at, event_id,
            users:user_id (id, name, avatar_url),
            events:event_id (id, title, artist_name, venue_name, event_date)
          `)
          .eq('artist_id', resolvedId)
          .not('review_text', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5);
        const reviewRows = (reviewData || []) as ReviewRow[];
        setReviews(reviewRows);

        // Average rating
        const ratings = reviewRows
          .map(r => r.rating)
          .filter((r): r is number => typeof r === 'number');
        if (ratings.length > 0) {
          setAvgRating(ratings.reduce((a, b) => a + b, 0) / ratings.length);
        } else {
          setAvgRating(null);
        }

        // Follower count
        const count = await ArtistFollowService.getFollowerCount(resolvedId);
        setFollowerCount(count);

        // Is following
        if (user?.id) {
          const following = await ArtistFollowService.isFollowingArtist(user.id, resolvedId);
          setIsFollowing(following);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggleFollow = useCallback(async () => {
    if (!sessionUserId || !artistId || followLoading) return;
    setFollowLoading(true);
    const next = !isFollowing;
    setIsFollowing(next);
    setFollowerCount(c => Math.max(0, next ? c + 1 : c - 1));
    const ok = await ArtistFollowService.setArtistFollow(sessionUserId, artistId, next);
    if (!ok) {
      setIsFollowing(!next);
      setFollowerCount(c => Math.max(0, next ? c - 1 : c + 1));
    }
    setFollowLoading(false);
  }, [sessionUserId, artistId, isFollowing, followLoading]);

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        title: name,
        message: `Check out ${name} on Synth!`,
      });
    } catch {
      // user dismissed
    }
  }, [name]);

  const visiblePast = showAllPast ? pastEvents : pastEvents.slice(0, 3);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
          </Pressable>
          <SynthText variant="h2" numberOfLines={1} style={{ flex: 1 }}>
            {name || 'Artist'}
          </SynthText>
          <Pressable onPress={() => void onShare()} style={styles.iconBtn} accessibilityLabel="Share">
            <Share2 size={22} color={SynthTokens.colors.neutral900} />
          </Pressable>
        </View>

        {loading ? (
          <ArtistScreenSkeleton />
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.hero} resizeMode="cover" />
            ) : null}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Users size={15} color={SynthTokens.colors.neutral600} />
                <SynthText variant="meta" color="secondary">
                  {followerCount.toLocaleString()} {followerCount === 1 ? 'follower' : 'followers'}
                </SynthText>
              </View>
              {avgRating != null ? (
                <View style={styles.statItem}>
                  <Star size={15} color="#F5A623" fill="#F5A623" />
                  <SynthText variant="meta" color="secondary">
                    {avgRating.toFixed(1)} avg rating
                  </SynthText>
                </View>
              ) : null}
            </View>

            {/* Genres */}
            {genres.length > 0 ? (
              <View style={styles.genreRow}>
                {genres.slice(0, 6).map(g => (
                  <View key={g} style={styles.genreChip}>
                    <Text style={styles.genreChipText}>{g}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Follow button */}
            {sessionUserId && artistId ? (
              <Pressable
                onPress={() => void onToggleFollow()}
                style={[styles.followBtn, isFollowing && styles.followBtnOn]}
                disabled={followLoading}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color={isFollowing ? PINK : SynthTokens.colors.neutral0} />
                ) : (
                  <Text style={[styles.followBtnTxt, isFollowing && styles.followBtnTxtOn]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                )}
              </Pressable>
            ) : null}

            {/* Upcoming shows */}
            <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
              Upcoming shows
            </SynthText>
            {upcomingEvents.length === 0 ? (
              <SynthText variant="body" color="secondary" style={styles.emptyMsg}>
                No upcoming events in the catalog for this artist.
              </SynthText>
            ) : (
              <View style={styles.cardsNegMargin}>
                {upcomingEvents.map(e => (
                  <EventCard
                    key={e.id}
                    id={e.id}
                    title={e.title}
                    artist_name={e.artist_name}
                    venue_name={e.venue_name}
                    venue_city={e.venue_city}
                    event_date={e.event_date}
                    image_url={e.image_url}
                    ticket_url={e.ticket_url}
                    artist_id={e.artist_id}
                    venue_id={e.venue_id}
                  />
                ))}
              </View>
            )}

            {/* Past shows */}
            {pastEvents.length > 0 ? (
              <>
                <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
                  Past shows
                </SynthText>
                <View style={styles.cardsNegMargin}>
                  {visiblePast.map(e => (
                    <EventCard
                      key={e.id}
                      id={e.id}
                      title={e.title}
                      artist_name={e.artist_name}
                      venue_name={e.venue_name}
                      venue_city={e.venue_city}
                      event_date={e.event_date}
                      image_url={e.image_url}
                      ticket_url={e.ticket_url}
                      artist_id={e.artist_id}
                      venue_id={e.venue_id}
                    />
                  ))}
                </View>
                {pastEvents.length > 3 && !showAllPast ? (
                  <Pressable onPress={() => setShowAllPast(true)} style={styles.showMoreBtn}>
                    <Text style={styles.showMoreTxt}>Show {pastEvents.length - 3} more past shows</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {/* Reviews */}
            {reviews.length > 0 ? (
              <>
                <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
                  Reviews
                </SynthText>
                <View style={styles.reviewsBox}>
                  {reviews.map(r => (
                    <ReviewItem key={r.id} review={r} />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 16, paddingBottom: 48, gap: 12 },
  hero: { width: '100%', height: 200, borderRadius: 16, marginBottom: 4 },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: SynthTokens.colors.neutral100,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  genreChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  followBtn: {
    height: 48,
    borderRadius: SynthTokens.radius.corner,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  followBtnOn: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 2,
    borderColor: PINK,
  },
  followBtnTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral0,
  },
  followBtnTxtOn: {
    color: PINK,
  },
  sectionLabel: {
    marginBottom: 4,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyMsg: {
    marginBottom: 4,
  },
  cardsNegMargin: {
    marginHorizontal: -16,
  },
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: SynthTokens.radius.corner,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  showMoreTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: PINK,
  },
  reviewsBox: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: SynthTokens.radius.corner,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    paddingHorizontal: 16,
  },
});
