import React, { useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Text,
    Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import {
    ChevronLeft,
    Star,
    MapPin,
    Calendar,
    Music,
    Mic2,
    Lightbulb,
    Navigation,
    DollarSign,
    Share2,
    ThumbsUp,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventService } from '../../src/services/eventService';
import { ReviewEngagementService } from '../../src/services/reviewEngagementService';

const PINK = SynthTokens.colors.brandPink500;
const SCREEN_W = Dimensions.get('window').width;
const PHOTO_SIZE = (SCREEN_W - 32 - 8) / 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type EventSummary = {
    id: string;
    title: string | null;
    event_date: string | null;
    artist_name: string | null;
    venue_name: string | null;
    artist_id?: string | null;
    venue_id?: string | null;
    images?: { url?: string }[] | null;
};

type ReviewRow = {
    id: string;
    user_id: string;
    event_id: string | null;
    rating: number | null;
    review_text: string | null;
    photos: string[] | null;
    created_at: string;
    is_public: boolean;
    // Category ratings
    artist_performance_rating: number | null;
    production_rating: number | null;
    venue_rating: number | null;
    location_rating: number | null;
    value_rating: number | null;
    // Category feedback
    artist_performance_feedback: string | null;
    production_feedback: string | null;
    venue_feedback: string | null;
    location_feedback: string | null;
    value_feedback: string | null;
    // Author
    author: { id: string; name: string; avatar_url: string | null } | null;
    // Event
    events: EventSummary | null;
    // Engagement
    likes_count: number;
    comments_count: number;
    is_liked_by_user: boolean;
    // Attendees & extras
    attendees?: any[] | null;
    met_on_synth?: boolean | null;
    setlist?: any | null;
    custom_setlist?: any[] | null;
};

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRatingRow({
    icon,
    label,
    rating,
    feedback,
}: {
    icon: React.ReactNode;
    label: string;
    rating: number | null;
    feedback: string | null;
}) {
    if (!rating && !feedback) return null;
    return (
        <View style={catStyles.row}>
            <View style={catStyles.labelRow}>
                {icon}
                <SynthText variant="meta" style={catStyles.label}>{label}</SynthText>
                {rating != null ? (
                    <View style={catStyles.ratingPill}>
                        <Star size={11} color={SynthTokens.colors.neutral0} fill={SynthTokens.colors.neutral0} />
                        <Text style={catStyles.ratingText}>{rating.toFixed(1)}</Text>
                    </View>
                ) : null}
            </View>
            {feedback?.trim() ? (
                <SynthText variant="meta" color="secondary" style={catStyles.feedback}>
                    {feedback.trim()}
                </SynthText>
            ) : null}
        </View>
    );
}

const catStyles = StyleSheet.create({
    row: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
        gap: 4,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    label: {
        flex: 1,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    ratingPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#F5A623',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    ratingText: {
        color: SynthTokens.colors.neutral0,
        fontSize: 12,
        fontWeight: '700',
    },
    feedback: {
        fontStyle: 'italic',
        lineHeight: 18,
        paddingLeft: 24,
    },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReviewDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [review, setReview] = useState<ReviewRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [sessionUserId, setSessionUserId] = useState<string | null>(null);
    const [likesCount, setLikesCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [liking, setLiking] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            if (!id) {
                setLoading(false);
                return;
            }
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }
            setSessionUserId(user.id);

            const { data, error } = await supabase
                .from('reviews')
                .select(`
                    id,
                    user_id,
                    event_id,
                    rating,
                    review_text,
                    photos,
                    created_at,
                    is_public,
                    artist_performance_rating,
                    production_rating,
                    venue_rating,
                    location_rating,
                    value_rating,
                    artist_performance_feedback,
                    production_feedback,
                    venue_feedback,
                    location_feedback,
                    value_feedback,
                    likes_count,
                    comments_count,
                    attendees,
                    met_on_synth,
                    setlist,
                    custom_setlist,
                    users:user_id (id, name, avatar_url),
                    events:event_id (
                        id, title, event_date,
                        artist_name, venue_name,
                        artist_id, venue_id,
                        images
                    )
                `)
                .eq('id', id)
                .maybeSingle();

            if (cancelled) return;

            if (error || !data) {
                setReview(null);
                setLoading(false);
                return;
            }

            const row = data as Record<string, unknown>;

            // Normalize author
            const usersRaw = row.users;
            let author: ReviewRow['author'] = null;
            if (Array.isArray(usersRaw) && usersRaw[0]) {
                author = usersRaw[0] as ReviewRow['author'];
            } else if (usersRaw && typeof usersRaw === 'object' && !Array.isArray(usersRaw)) {
                author = usersRaw as ReviewRow['author'];
            }

            // Normalize event
            const evRaw = row.events;
            let evOne: EventSummary | null = null;
            if (Array.isArray(evRaw) && evRaw[0]) {
                evOne = evRaw[0] as EventSummary;
            } else if (evRaw && typeof evRaw === 'object' && !Array.isArray(evRaw)) {
                evOne = evRaw as EventSummary;
            }

            // Check helpful status for current user
            const likedSet = await ReviewEngagementService.getReviewIdsLikedByUser(user.id, [String(id)]);

            const normalized: ReviewRow = {
                id: String(row.id),
                user_id: String(row.user_id),
                event_id: row.event_id != null ? String(row.event_id) : null,
                rating: row.rating != null ? Number(row.rating) : null,
                review_text: row.review_text != null ? String(row.review_text) : null,
                photos: Array.isArray(row.photos) ? (row.photos as string[]) : null,
                created_at: String(row.created_at),
                is_public: Boolean(row.is_public),
                artist_performance_rating: row.artist_performance_rating != null ? Number(row.artist_performance_rating) : null,
                production_rating: row.production_rating != null ? Number(row.production_rating) : null,
                venue_rating: row.venue_rating != null ? Number(row.venue_rating) : null,
                location_rating: row.location_rating != null ? Number(row.location_rating) : null,
                value_rating: row.value_rating != null ? Number(row.value_rating) : null,
                artist_performance_feedback: row.artist_performance_feedback != null ? String(row.artist_performance_feedback) : null,
                production_feedback: row.production_feedback != null ? String(row.production_feedback) : null,
                venue_feedback: row.venue_feedback != null ? String(row.venue_feedback) : null,
                location_feedback: row.location_feedback != null ? String(row.location_feedback) : null,
                value_feedback: row.value_feedback != null ? String(row.value_feedback) : null,
                author,
                events: evOne,
                likes_count: typeof row.likes_count === 'number' ? row.likes_count : 0,
                comments_count: typeof row.comments_count === 'number' ? row.comments_count : 0,
                is_liked_by_user: likedSet.has(String(id)),
                attendees: Array.isArray(row.attendees) ? row.attendees : null,
                met_on_synth: typeof row.met_on_synth === 'boolean' ? row.met_on_synth : null,
                setlist: row.setlist ?? null,
                custom_setlist: Array.isArray(row.custom_setlist) ? row.custom_setlist : null,
            };

            const isOwner = normalized.user_id === user.id;
            if (!normalized.is_public && !isOwner) {
                setForbidden(true);
                setReview(null);
                setLoading(false);
                return;
            }

            setForbidden(false);
            setReview(normalized);
            setLikesCount(normalized.likes_count);
            setIsLiked(normalized.is_liked_by_user);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [id]);

    const onHelpful = async () => {
        if (!sessionUserId || !review || liking) return;
        setLiking(true);
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setLikesCount(c => Math.max(0, wasLiked ? c - 1 : c + 1));
        try {
            await ReviewEngagementService.toggleHelpful(sessionUserId, review.id, wasLiked);
        } catch {
            setIsLiked(wasLiked);
            setLikesCount(c => Math.max(0, wasLiked ? c + 1 : c - 1));
        } finally {
            setLiking(false);
        }
    };

    const onShare = () => {
        if (!review) return;
        const ev = review.events;
        const headline = ev?.artist_name
            ? `${ev.artist_name}${ev.venue_name ? ` at ${ev.venue_name}` : ''}`
            : 'Concert Review';
        void EventService.shareReviewLink(review.id, { headline, snippet: review.review_text ?? undefined });
    };

    // ─── Loading / error states ───────────────────────────────────────────────

    if (loading) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
                    <ActivityIndicator size="large" color={PINK} />
                </View>
            </>
        );
    }

    if (!review || forbidden) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={[styles.root, { paddingTop: insets.top }]}>
                    <View style={styles.topBar}>
                        <Pressable onPress={() => router.back()} style={styles.back}>
                            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
                        </Pressable>
                    </View>
                    <View style={styles.centered}>
                        <SynthText variant="h2" style={{ marginBottom: 8 }}>
                            {forbidden ? 'Private review' : 'Review not found'}
                        </SynthText>
                        <SynthText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                            {forbidden
                                ? 'You do not have access to this review.'
                                : 'This review may have been removed or the link is invalid.'}
                        </SynthText>
                    </View>
                </View>
            </>
        );
    }

    // ─── Derived data ─────────────────────────────────────────────────────────

    const ev = review.events;
    const headline =
        ev?.title?.trim() ||
        (ev?.artist_name && ev?.venue_name
            ? `${ev.artist_name} at ${ev.venue_name}`
            : ev?.artist_name || ev?.venue_name || 'Concert Review');

    const heroImageUrl =
        (review.photos && review.photos.length > 0 ? review.photos[0] : null) ||
        ev?.images?.[0]?.url ||
        null;

    const hasCategoryBreakdown =
        review.artist_performance_rating != null ||
        review.production_rating != null ||
        review.venue_rating != null ||
        review.location_rating != null ||
        review.value_rating != null ||
        review.artist_performance_feedback?.trim() ||
        review.production_feedback?.trim() ||
        review.venue_feedback?.trim() ||
        review.location_feedback?.trim() ||
        review.value_feedback?.trim();

    const photos = review.photos ?? [];

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.root, { paddingTop: insets.top }]}>
                {/* Top bar */}
                <View style={styles.topBar}>
                    <Pressable onPress={() => router.back()} style={styles.back}>
                        <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
                    </Pressable>
                    <View style={styles.topBarActions}>
                        <Pressable onPress={onShare} style={styles.topActionBtn} accessibilityLabel="Share review">
                            <Share2 size={20} color={SynthTokens.colors.neutral900} />
                        </Pressable>
                    </View>
                </View>

                <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
                    {/* Hero image */}
                    {heroImageUrl ? (
                        <Image source={{ uri: heroImageUrl }} style={styles.hero} contentFit="cover" />
                    ) : (
                        <View style={[styles.hero, styles.heroPlaceholder]} />
                    )}

                    <View style={styles.body}>
                        {/* Event headline */}
                        <SynthText variant="h1" style={styles.title} numberOfLines={3}>
                            {headline}
                        </SynthText>

                        {/* Author */}
                        {review.author ? (
                            <View style={styles.authorRow}>
                                {review.author.avatar_url ? (
                                    <Image source={{ uri: review.author.avatar_url }} style={styles.avatar} contentFit="cover" />
                                ) : (
                                    <View style={[styles.avatar, styles.avatarFallback]}>
                                        <Text style={styles.avatarLetter}>
                                            {(review.author.name || '?').charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                                <SynthText variant="meta" color="secondary">
                                    Reviewed by{' '}
                                    <SynthText variant="meta" style={styles.authorName}>
                                        {review.author.name}
                                    </SynthText>
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Overall rating */}
                        {review.rating != null ? (
                            <View style={styles.overallRatingRow}>
                                {[1, 2, 3, 4, 5].map(n => {
                                    const filled = review.rating! >= n;
                                    const half = !filled && review.rating! >= n - 0.5;
                                    return (
                                        <Star
                                            key={n}
                                            size={26}
                                            color="#F5A623"
                                            fill={filled || half ? '#F5A623' : 'transparent'}
                                        />
                                    );
                                })}
                                <SynthText variant="h2" style={styles.overallRatingNum}>
                                    {review.rating.toFixed(1)}
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Event meta */}
                        {ev?.venue_name ? (
                            <Pressable
                                style={styles.metaRow}
                                onPress={ev.venue_id ? () => router.push(`/venue/${ev.venue_id}` as any) : undefined}
                            >
                                <MapPin size={16} color={PINK} />
                                <SynthText
                                    variant="meta"
                                    style={[styles.metaTxt, ev.venue_id ? styles.metaLink : undefined]}
                                    numberOfLines={1}
                                >
                                    {ev.venue_name}
                                </SynthText>
                            </Pressable>
                        ) : null}
                        {ev?.artist_name ? (
                            <Pressable
                                style={styles.metaRow}
                                onPress={ev.artist_id ? () => router.push(`/artist/${ev.artist_id}` as any) : undefined}
                            >
                                <Music size={16} color={PINK} />
                                <SynthText
                                    variant="meta"
                                    style={[styles.metaTxt, ev.artist_id ? styles.metaLink : undefined]}
                                    numberOfLines={1}
                                >
                                    {ev.artist_name}
                                </SynthText>
                            </Pressable>
                        ) : null}
                        {ev?.event_date ? (
                            <View style={styles.metaRow}>
                                <Calendar size={16} color={PINK} />
                                <SynthText variant="meta" color="secondary" style={styles.metaTxt}>
                                    {new Date(ev.event_date).toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Review text */}
                        {review.review_text && review.review_text !== 'ATTENDANCE_ONLY' ? (
                            <View style={styles.reviewTextBox}>
                                <SynthText variant="body" style={styles.reviewBody}>
                                    {review.review_text}
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Category breakdown */}
                        {hasCategoryBreakdown ? (
                            <View style={styles.card}>
                                <SynthText variant="meta" style={styles.sectionLabel}>
                                    CATEGORY BREAKDOWN
                                </SynthText>
                                <CategoryRatingRow
                                    icon={<Mic2 size={14} color={PINK} />}
                                    label="Artist Performance"
                                    rating={review.artist_performance_rating}
                                    feedback={review.artist_performance_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<Lightbulb size={14} color={PINK} />}
                                    label="Production"
                                    rating={review.production_rating}
                                    feedback={review.production_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<MapPin size={14} color={PINK} />}
                                    label="Venue Experience"
                                    rating={review.venue_rating}
                                    feedback={review.venue_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<Navigation size={14} color={PINK} />}
                                    label="Location & Logistics"
                                    rating={review.location_rating}
                                    feedback={review.location_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<DollarSign size={14} color={PINK} />}
                                    label="Value"
                                    rating={review.value_rating}
                                    feedback={review.value_feedback}
                                />
                            </View>
                        ) : null}

                        {/* Photos grid */}
                        {photos.length > 0 ? (
                            <View style={styles.card}>
                                <SynthText variant="meta" style={styles.sectionLabel}>
                                    PHOTOS ({photos.length})
                                </SynthText>
                                <View style={styles.photoGrid}>
                                    {photos.map((uri, i) => (
                                        <Image
                                            key={i}
                                            source={{ uri }}
                                            style={styles.photo}
                                            contentFit="cover"
                                        />
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {/* Attendees */}
                        {(() => {
                            const atts = review.attendees?.filter(
                                (a: any) => a?.type === 'user' && (a?.name || a?.user_id)
                            );
                            if (!atts?.length) return null;
                            return (
                                <View style={styles.card}>
                                    <SynthText variant="meta" style={styles.sectionLabel}>
                                        ATTENDED WITH
                                    </SynthText>
                                    <View style={styles.attendeesRow}>
                                        {atts.map((a: any, i: number) => (
                                            <View key={i} style={styles.attendeeChip}>
                                                <SynthText variant="meta" style={styles.attendeeName}>
                                                    {a.name || 'User'}
                                                </SynthText>
                                                {review.met_on_synth && <SynthText variant="meta" color="brand" style={styles.metBadge}> · met on Synth</SynthText>}
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            );
                        })()}

                        {/* Setlist */}
                        {(() => {
                            const songs: any[] = (() => {
                                if (review.custom_setlist?.length) {
                                    const first = review.custom_setlist[0];
                                    return Array.isArray(first?.songs) ? first.songs : [];
                                }
                                if (review.setlist?.sets?.set) {
                                    const sets = review.setlist.sets.set;
                                    return Array.isArray(sets)
                                        ? sets.flatMap((s: any) => Array.isArray(s.song) ? s.song : [])
                                        : [];
                                }
                                return [];
                            })();
                            if (!songs.length) return null;
                            return (
                                <View style={styles.card}>
                                    <SynthText variant="meta" style={styles.sectionLabel}>
                                        SETLIST ({songs.length} songs)
                                    </SynthText>
                                    {songs.map((song: any, i: number) => (
                                        <View key={i} style={styles.setlistRow}>
                                            <Text style={styles.setlistNum}>{i + 1}</Text>
                                            <SynthText variant="meta" style={styles.setlistSong} numberOfLines={1}>
                                                {song.name || song.song_name || 'Unknown'}
                                                {song.cover_artist ? ` (${song.cover_artist})` : ''}
                                            </SynthText>
                                        </View>
                                    ))}
                                </View>
                            );
                        })()}

                        {/* Engagement */}
                        <View style={styles.engagementRow}>
                            <Pressable
                                onPress={() => void onHelpful()}
                                style={[styles.engagementBtn, isLiked && styles.engagementBtnOn]}
                                disabled={!sessionUserId || liking}
                            >
                                {liking ? (
                                    <ActivityIndicator size="small" color={PINK} />
                                ) : (
                                    <>
                                        <ThumbsUp
                                            size={16}
                                            color={isLiked ? PINK : SynthTokens.colors.neutral600}
                                            fill={isLiked ? PINK : 'transparent'}
                                        />
                                        <Text style={[styles.engagementBtnTxt, isLiked && styles.engagementBtnTxtOn]}>
                                            {likesCount > 0 ? `${likesCount} ` : ''}Helpful
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        </View>

                        {/* View event link */}
                        {ev?.id ? (
                            <Pressable
                                style={styles.eventLink}
                                onPress={() => router.push(`/event/${ev.id}` as any)}
                            >
                                <SynthText variant="meta" style={styles.eventLinkTxt}>
                                    View event page →
                                </SynthText>
                            </Pressable>
                        ) : null}
                    </View>
                </ScrollView>
            </View>
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingBottom: 4,
        backgroundColor: SynthTokens.colors.neutral0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    topBarActions: { flexDirection: 'row', alignItems: 'center' },
    topActionBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    scroll: {},
    hero: { width: '100%', height: 240, backgroundColor: SynthTokens.colors.neutral200 },
    heroPlaceholder: { height: 0 },
    body: { padding: 16, gap: 12 },
    title: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: PINK },
    avatarFallback: { backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: SynthTokens.colors.neutral0, fontWeight: '700', fontSize: 13 },
    authorName: { fontWeight: '700', color: SynthTokens.colors.neutral900 },
    overallRatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    overallRatingNum: {
        marginLeft: 8,
        fontSize: 22,
        fontWeight: '800',
        color: '#F5A623',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaTxt: { flex: 1, fontSize: 15 },
    metaLink: { color: PINK, fontWeight: '600' },
    reviewTextBox: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        padding: 16,
    },
    reviewBody: { lineHeight: 26 },
    card: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        padding: 16,
        gap: 0,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        color: SynthTokens.colors.neutral600,
        marginBottom: 8,
    },
    photoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
    },
    photo: {
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        borderRadius: 8,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    engagementRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    engagementBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    engagementBtnOn: {
        borderColor: PINK,
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    engagementBtnTxt: {
        fontSize: 15,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
    },
    engagementBtnTxtOn: { color: PINK },
    eventLink: {
        alignSelf: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    eventLinkTxt: { color: PINK, fontWeight: '700' },
    attendeesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    attendeeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral100,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    attendeeName: {
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    metBadge: {
        fontSize: 11,
    },
    setlistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    setlistNum: {
        width: 22,
        fontSize: 12,
        fontWeight: '700',
        color: SynthTokens.colors.neutral400,
        textAlign: 'right',
    },
    setlistSong: {
        flex: 1,
        fontWeight: '500',
        color: SynthTokens.colors.neutral900,
    },
});
