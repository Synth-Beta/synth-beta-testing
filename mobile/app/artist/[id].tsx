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
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Share2, Star, Users, Camera } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventCard } from '../../src/components/Feed/EventCard';
import { NetworkReviewCard } from '../../src/components/Feed/NetworkReviewCard';
import { NetworkReview } from '../../src/services/homeFeedService';
import { ArtistScreenSkeleton } from '../../src/components/skeletons/ArtistScreenSkeleton';
import { EventService } from '../../src/services/eventService';
import { ArtistFollowService } from '../../src/services/artistFollowService';
import { JamBaseAttributionInline } from '../../src/components/Feed/JamBaseAttributionInline';
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
  photos?: string[] | null;
  likes_count?: number | null;
  comments_count?: number | null;
  artist_performance_rating?: number | null;
  production_rating?: number | null;
  venue_rating?: number | null;
  location_rating?: number | null;
  value_rating?: number | null;
  // PostgREST many-to-one joins return single objects, not arrays
  users?: { id: string; name: string; avatar_url?: string | null } | null;
  events?: {
    id: string;
    title?: string | null;
    artist_name?: string | null;
    venue_name?: string | null;
    event_date?: string | null;
  } | null;
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
  const [reviews, setReviews] = useState<NetworkReview[]>([]);
  const [mediaPhotos, setMediaPhotos] = useState<string[]>([]);
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

        // Reviews — two-wave like web: direct (artist_id) + event-linked (event_id IN events)
        const allEventIds = [
          ...(upcomingData || []).map((e: any) => e.id as string),
          ...(pastData || []).map((e: any) => e.id as string),
        ];
        const reviewsSelect = `
          id, user_id, rating, review_text, created_at, event_id, photos, likes_count, comments_count,
          artist_performance_rating, production_rating, venue_rating, location_rating, value_rating,
          users:user_id (id, name, avatar_url),
          events:event_id (id, title, artist_name, venue_name, event_date)
        `;
        const [directRes, eventLinkedRes] = await Promise.all([
          supabase.from('reviews').select(reviewsSelect)
            .eq('artist_id', resolvedId)
            .order('created_at', { ascending: false }).limit(20),
          allEventIds.length > 0
            ? supabase.from('reviews').select(reviewsSelect)
                .in('event_id', allEventIds)
                .order('created_at', { ascending: false }).limit(20)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const seen = new Set<string>();
        const combined = [...(directRes.data || []), ...((eventLinkedRes as any).data || [])]
          .filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 15);
        const reviewRows = combined as ReviewRow[];
        setReviews(reviewRows.map((rv): NetworkReview => ({
          id: String(rv.id),
          event_id: rv.event_id ?? undefined,
          artist_id: resolvedId ?? undefined,
          author: {
            id: String(rv.user_id),
            name: rv.users?.name || 'User',
            avatar_url: rv.users?.avatar_url ?? undefined,
          },
          created_at: String(rv.created_at),
          rating: rv.rating != null ? Number(rv.rating) : undefined,
          content: rv.review_text || undefined,
          photos: Array.isArray(rv.photos) ? rv.photos : undefined,
          artist_image_url: artist?.image_url ?? undefined,
          artist_performance_rating: rv.artist_performance_rating != null ? Number(rv.artist_performance_rating) : undefined,
          production_rating: rv.production_rating != null ? Number(rv.production_rating) : undefined,
          venue_rating: rv.venue_rating != null ? Number(rv.venue_rating) : undefined,
          location_rating: rv.location_rating != null ? Number(rv.location_rating) : undefined,
          value_rating: rv.value_rating != null ? Number(rv.value_rating) : undefined,
          likes_count: typeof rv.likes_count === 'number' ? rv.likes_count : 0,
          comments_count: typeof rv.comments_count === 'number' ? rv.comments_count : 0,
          is_liked_by_user: false,
          connection_degree: 1,
          event_info: {
            artist_name: artistName,
            venue_name: rv.events?.venue_name ?? undefined,
            event_date: rv.events?.event_date ?? undefined,
          },
        })));

        // Collect media photos from all reviews
        const photos: string[] = [];
        reviewRows.forEach(r => {
          const p = (r as any).photos;
          if (Array.isArray(p)) p.forEach((u: string) => u && photos.push(u));
        });
        setMediaPhotos(photos);

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

            {/* Reviews — above events, like web */}
            {reviews.length > 0 ? (
              <>
                <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
                  Reviews ({reviews.length})
                </SynthText>
                <View style={styles.cardsNegMargin}>
                  {reviews.map(r => (
                    <NetworkReviewCard
                      key={r.id}
                      review={r}
                      currentUserId={sessionUserId}
                      onPress={() => router.push(`/review/${r.id}` as any)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* Media grid — photos from reviews */}
            {mediaPhotos.length > 0 ? (
              <>
                <View style={styles.sectionLabelRow}>
                  <Camera size={14} color={PINK} />
                  <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
                    Media ({mediaPhotos.length})
                  </SynthText>
                </View>
                <View style={styles.mediaGrid}>
                  {mediaPhotos.slice(0, 6).map((uri, i) => (
                    <ExpoImage
                      key={i}
                      source={{ uri }}
                      style={styles.mediaThumb}
                      contentFit="cover"
                    />
                  ))}
                </View>
              </>
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

            {/* JamBase attribution */}
            <View style={styles.attributionRow}>
              <JamBaseAttributionInline />
            </View>
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
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  mediaThumb: {
    width: (Dimensions.get('window').width - 32 - 8) / 3,
    height: (Dimensions.get('window').width - 32 - 8) / 3,
    borderRadius: 8,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  attributionRow: {
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
  },
});
