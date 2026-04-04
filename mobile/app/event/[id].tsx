import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, Pressable, Linking, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { EventService, EventDetail, FriendAttending } from '../../src/services/eventService';
import { supabase } from '../../src/integrations/supabase/client';
import {
    ChevronLeft,
    Share as ShareIcon,
    MapPin,
    Calendar,
    Users,
    Clock,
    Ticket,
    Music,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { EventDetailsSkeleton } from '../../src/components/skeletons/EventDetailsSkeleton';
import { NetworkReviewCard } from '../../src/components/Feed/NetworkReviewCard';
import type { NetworkReview } from '../../src/services/homeFeedService';
import { ReviewEngagementService } from '../../src/services/reviewEngagementService';
import { SynthMap } from '../../src/components/maps/SynthMap';
import { JamBaseAttributionInline } from '../../src/components/Feed/JamBaseAttributionInline';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.45;

function formatDoorsLine(doorsTime: string | null | undefined): string | null {
    if (!doorsTime) return null;
    const d = new Date(doorsTime);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatEventPrice(e: EventDetail): string | null {
    const pr = e.price_range?.trim();
    if (pr) return pr;
    const cur = e.price_currency || 'USD';
    const min = e.price_min;
    const max = e.price_max;
    if (min != null && max != null && max > min) {
        try {
            const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur });
            return `${fmt.format(min)} – ${fmt.format(max)}`;
        } catch {
            return `$${min} – $${max}`;
        }
    }
    if (min != null && min >= 0) {
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(min);
        } catch {
            return `$${min}`;
        }
    }
    return null;
}

function venueDetailLine(e: EventDetail): string {
    const cityState = [e.venue_city, e.venue_state].filter(Boolean).join(', ');
    const parts = [e.venue_address?.trim(), cityState].filter(p => p && p.length > 0);
    return parts.join(' · ');
}

export default function EventDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [event, setEvent] = useState<EventDetail | null>(null);
    const [friends, setFriends] = useState<FriendAttending[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGoing, setIsGoing] = useState(false);
    const [isInterested, setIsInterested] = useState(false);
    const [reviews, setReviews] = useState<NetworkReview[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [sessionUserId, setSessionUserId] = useState<string | null>(null);

    useEffect(() => {
        void loadData();
    }, [id]);

    const loadData = async () => {
        setLoading(true);
        setIsGoing(false);
        setIsInterested(false);
        setReviews([]);
        setFriends([]);
        setSessionUserId(null);

        if (!id) {
            setEvent(null);
            setLoading(false);
            return;
        }

        const eventData = await EventService.getEventById(id);
        setEvent(eventData);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setSessionUserId(null);
            if (eventData) {
                void loadReviewsForEvent(eventData.id, eventData, null);
            }
            setLoading(false);
            return;
        }

        setSessionUserId(user.id);

        if (!eventData) {
            setLoading(false);
            return;
        }

        const { data: rel } = await supabase
            .from('user_event_relationships')
            .select('relationship_type')
            .eq('user_id', user.id)
            .eq('event_id', eventData.id)
            .maybeSingle();
        if (rel?.relationship_type === 'going') {
            setIsGoing(true);
            setIsInterested(false);
        } else if (rel?.relationship_type === 'interested') {
            setIsInterested(true);
            setIsGoing(false);
        }

        const friendsData = await EventService.getFriendsAttending(eventData.id, user.id);
        setFriends(friendsData);
        void loadReviewsForEvent(eventData.id, eventData, user.id);
        setLoading(false);
    };

    const loadReviewsForEvent = async (eventUuid: string, eventInfo: EventDetail, viewerId: string | null) => {
        setReviewsLoading(true);
        try {
            const { data, error } = await supabase
                .from('reviews')
                .select(
                    `
          id,
          user_id,
          artist_id,
          venue_id,
          rating,
          review_text,
          photos,
          likes_count,
          comments_count,
          shares_count,
          created_at,
          users:user_id (
            id,
            name,
            avatar_url
          )
        `
                )
                .eq('event_id', eventUuid)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) {
                setReviews([]);
                return;
            }
            const rows = data || [];
            const reviewIds = rows.map((rv: any) => String(rv.id));
            let likedIds = new Set<string>();
            if (viewerId) {
                try {
                    likedIds = await ReviewEngagementService.getReviewIdsLikedByUser(viewerId, reviewIds);
                } catch (engErr) {
                    console.error('[event] getReviewIdsLikedByUser', engErr);
                }
            }

            const artistIdSet = new Set<string>();
            const venueIdSet = new Set<string>();
            for (const rv of rows as { artist_id?: string | null; venue_id?: string | null }[]) {
                const a = rv.artist_id ?? eventInfo.artist_id;
                const v = rv.venue_id ?? eventInfo.venue_id;
                if (a != null) artistIdSet.add(String(a));
                if (v != null) venueIdSet.add(String(v));
            }

            const artistsMap = new Map<string, { name: string; image_url: string | null }>();
            if (artistIdSet.size > 0) {
                const { data: artists } = await supabase
                    .from('artists')
                    .select('id, name, image_url')
                    .in('id', Array.from(artistIdSet));
                artists?.forEach(a => artistsMap.set(String(a.id), { name: a.name, image_url: a.image_url }));
            }

            const venuesMap = new Map<string, string>();
            if (venueIdSet.size > 0) {
                const { data: venues } = await supabase
                    .from('venues')
                    .select('id, name')
                    .in('id', Array.from(venueIdSet));
                venues?.forEach(v => venuesMap.set(String(v.id), v.name));
            }

            const mapped: NetworkReview[] = rows.map((rv: any) => {
                const artistIdStr =
                    rv.artist_id != null ? String(rv.artist_id) : eventInfo.artist_id != null ? String(eventInfo.artist_id) : undefined;
                const venueIdStr =
                    rv.venue_id != null ? String(rv.venue_id) : eventInfo.venue_id != null ? String(eventInfo.venue_id) : undefined;
                const artistRow = artistIdStr ? artistsMap.get(artistIdStr) : undefined;
                const venueNameResolved = venueIdStr ? venuesMap.get(venueIdStr) : undefined;

                return {
                    id: String(rv.id),
                    event_id: eventUuid,
                    artist_id: artistIdStr,
                    venue_id: venueIdStr,
                    author: {
                        id: String(rv.user_id),
                        name: rv.users?.name || 'User',
                        avatar_url: rv.users?.avatar_url || undefined,
                    },
                    created_at: String(rv.created_at),
                    rating: rv.rating != null ? Number(rv.rating) : undefined,
                    content: rv.review_text || undefined,
                    photos: Array.isArray(rv.photos) ? rv.photos : undefined,
                    artist_image_url: artistRow?.image_url ?? undefined,
                    likes_count: typeof rv.likes_count === 'number' ? rv.likes_count : 0,
                    comments_count: typeof rv.comments_count === 'number' ? rv.comments_count : 0,
                    shares_count: typeof rv.shares_count === 'number' ? rv.shares_count : 0,
                    is_liked_by_user: likedIds.has(String(rv.id)),
                    connection_degree: 1,
                    event_info: {
                        artist_name: artistRow?.name ?? eventInfo.artist_name,
                        venue_name: venueNameResolved ?? eventInfo.venue_name,
                        event_date: eventInfo.event_date,
                    },
                };
            });
            setReviews(mapped);
        } finally {
            setReviewsLoading(false);
        }
    };

    const handleShare = () => {
        if (!event) return;
        const headline =
            event.title?.trim() ||
            `${event.artist_name || 'Show'}${event.venue_name ? ` at ${event.venue_name}` : ''}`;
        let formattedDate = 'Date TBA';
        if (event.event_date) {
            const d = new Date(event.event_date);
            if (Number.isFinite(d.getTime())) {
                formattedDate = d.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                });
            }
        }
        void EventService.shareEventLink(event.id, { headline, formattedDate });
    };

    const handleToggleGoing = async () => {
        if (!sessionUserId) {
            router.push('/(auth)/sign-in');
            return;
        }
        if (!event) return;

        const success = await EventService.toggleInteraction(sessionUserId, event.id, 'going');
        if (success) {
            const next = !isGoing;
            setIsGoing(next);
            if (next) setIsInterested(false);
        }
    };

    const handleToggleInterested = async () => {
        if (!sessionUserId) {
            router.push('/(auth)/sign-in');
            return;
        }
        if (!event) return;

        const success = await EventService.toggleInteraction(sessionUserId, event.id, 'interested');
        if (success) {
            const next = !isInterested;
            setIsInterested(next);
            if (next) setIsGoing(false);
        }
    };

    const openTicketLink = async () => {
        const url = event?.ticket_url?.trim();
        if (!url) return;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
    };

    const openInMaps = async () => {
        if (!event) return;
        const q = encodeURIComponent(
            [event.venue_name, event.venue_address, event.venue_city, event.venue_state].filter(Boolean).join(' ')
        );
        const url = `https://www.google.com/maps/search/?api=1&query=${q}`;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
    };

    const reportEvent = async () => {
        if (!event) return;
        const subject = encodeURIComponent(`Report event ${event.id}`);
        const body = encodeURIComponent(
            `Please describe the issue.\n\nEvent:\n- id: ${event.id}\n- artist: ${event.artist_name}\n- venue: ${event.venue_name}\n- date: ${event.event_date}\n`
        );
        const url = `mailto:support@synth.app?subject=${subject}&body=${body}`;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
    };

    if (loading) {
        return <EventDetailsSkeleton />;
    }

    if (!event) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
                <Pressable onPress={() => router.back()} style={styles.backRow}>
                    <ChevronLeft size={24} color={SynthTokens.colors.neutral900} />
                    <SynthText variant="meta" color="primary">
                        Back
                    </SynthText>
                </Pressable>
                <View style={styles.emptyBlock}>
                    <SynthText variant="h2" style={styles.emptyTitle}>
                        Event not found
                    </SynthText>
                    <SynthText variant="body" color="secondary" style={styles.emptyBody}>
                        This link may be invalid, or the event may have been removed.
                    </SynthText>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Hero Section */}
                <View style={styles.heroContainer}>
                    <Image
                        source={event.image_url ? { uri: event.image_url } : require('../../assets/placeholder-event.png')}
                        style={styles.heroImage}
                        contentFit="cover"
                    />
                    <LinearGradient
                        colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.8)']}
                        style={styles.heroGradient}
                    />

                    <View style={[styles.navHeader, { paddingTop: insets.top + 8 }]}>
                        <Pressable onPress={() => router.back()} style={styles.circleButton}>
                            <ChevronLeft size={24} color="white" />
                        </Pressable>
                        <Pressable onPress={handleShare} style={styles.circleButton}>
                            <ShareIcon size={20} color="white" />
                        </Pressable>
                    </View>

                    <View style={styles.heroContent}>
                        <Pressable
                            onPress={() => {
                                if (event.artist_id) router.push(`/artist/${event.artist_id}`);
                            }}
                            disabled={!event.artist_id}
                        >
                            <SynthText variant="h1" color="white" style={styles.heroTitle}>
                                {event.artist_name}
                            </SynthText>
                        </Pressable>
                        <SynthText variant="body" color="white" style={styles.heroSub}>
                            {event.title}
                        </SynthText>
                    </View>
                </View>

                {/* Metadata Overlay (Glassmorphism) */}
                <View style={styles.detailsContainer}>
                    <BlurView intensity={20} style={styles.metadataCard}>
                        <View style={styles.metadataRow}>
                            <Calendar size={18} color={SynthTokens.colors.brandPink500} />
                            <SynthText variant="meta" color="primary">
                                {event.event_date &&
                                    new Date(event.event_date).toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                            </SynthText>
                        </View>
                        {formatDoorsLine(event.doors_time) ? (
                            <View style={styles.metadataRow}>
                                <Clock size={18} color={SynthTokens.colors.brandPink500} />
                                <SynthText variant="meta" color="primary">
                                    Doors / show: {formatDoorsLine(event.doors_time)}
                                </SynthText>
                            </View>
                        ) : null}
                        <View style={styles.metadataRow}>
                            <MapPin size={18} color={SynthTokens.colors.brandPink500} />
                            <View style={styles.metadataTextCol}>
                                <Pressable
                                    onPress={() => {
                                        if (event.venue_id) router.push(`/venue/${event.venue_id}`);
                                    }}
                                    disabled={!event.venue_id}
                                >
                                    <SynthText variant="meta" color="primary" style={styles.bold}>
                                        {event.venue_name}
                                    </SynthText>
                                </Pressable>
                                {venueDetailLine(event) ? (
                                    <SynthText variant="meta" color="secondary" style={styles.venueDetailLine}>
                                        {venueDetailLine(event)}
                                    </SynthText>
                                ) : null}
                            </View>
                        </View>
                        {formatEventPrice(event) ? (
                            <View style={styles.metadataRow}>
                                <Ticket size={18} color={SynthTokens.colors.brandPink500} />
                                <SynthText variant="meta" color="primary">
                                    {formatEventPrice(event)}
                                </SynthText>
                            </View>
                        ) : null}
                        {event.tour_name?.trim() ? (
                            <View style={styles.metadataRow}>
                                <Music size={18} color={SynthTokens.colors.brandPink500} />
                                <SynthText variant="meta" color="primary">
                                    {event.tour_name.trim()}
                                </SynthText>
                            </View>
                        ) : null}
                    </BlurView>

                    {!sessionUserId ? (
                        <Pressable
                            onPress={() => router.push('/(auth)/sign-in')}
                            style={styles.signInBanner}
                            accessibilityRole="button"
                            accessibilityLabel="Sign in for full features"
                        >
                            <SynthText variant="meta" style={styles.signInBannerText}>
                                Sign in to mark Interested, see friends going, and write reviews.
                            </SynthText>
                        </Pressable>
                    ) : null}

                    {event.genres && event.genres.length > 0 ? (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.genreScroll}
                            contentContainerStyle={styles.genreScrollContent}
                        >
                            {event.genres.map(g => (
                                <View key={g} style={styles.genrePill}>
                                    <Text style={styles.genrePillText}>{g}</Text>
                                </View>
                            ))}
                        </ScrollView>
                    ) : null}

                    {/* Actions */}
                    <View style={styles.actionRow}>
                        <SynthButton
                            title="Interested"
                            variant={isInterested ? 'primary' : 'secondary'}
                            onPress={handleToggleInterested}
                            style={{ flex: 1 }}
                        />
                        <SynthButton
                            title={isGoing ? "You're Going!" : 'Going'}
                            variant={isGoing ? 'primary' : 'secondary'}
                            onPress={handleToggleGoing}
                            style={{ flex: 1 }}
                        />
                        <SynthButton
                            title="Review"
                            variant="secondary"
                            onPress={() => {
                                if (!sessionUserId) {
                                    router.push('/(auth)/sign-in');
                                    return;
                                }
                                router.push(`/review-compose?eventId=${event.id}`);
                            }}
                            style={{ flex: 1 }}
                        />
                    </View>
                    <View style={styles.actionRow}>
                        <SynthButton
                            title="Tickets"
                            variant="secondary"
                            onPress={openTicketLink}
                            style={{ flex: 1 }}
                            disabled={!event.ticket_url}
                        />
                        <SynthButton
                            title="Map"
                            variant="secondary"
                            onPress={openInMaps}
                            style={{ flex: 1 }}
                        />
                        <SynthButton
                            title="Report"
                            variant="secondary"
                            onPress={reportEvent}
                            style={{ flex: 1 }}
                        />
                    </View>

                    {/* Friends Section */}
                    {friends.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Users size={20} color={SynthTokens.colors.neutral900} />
                                <SynthText variant="h2" style={styles.sectionTitle}>
                                    Friends Going
                                </SynthText>
                            </View>
                            <View style={styles.avatarsRow}>
                                {friends.map(friend => (
                                    <View key={friend.id} style={styles.avatarCircle}>
                                        <Image
                                            source={
                                                friend.avatar_url
                                                    ? { uri: friend.avatar_url }
                                                    : require('../../assets/placeholder-user.png')
                                            }
                                            style={styles.friendAvatar}
                                        />
                                    </View>
                                ))}
                                {friends.length > 5 && (
                                    <View style={[styles.avatarCircle, styles.moreCircle]}>
                                        <SynthText variant="meta" color="white">
                                            +{friends.length - 5}
                                        </SynthText>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Description */}
                    {event.description ? (
                        <View style={styles.section}>
                            <SynthText variant="h2" style={styles.sectionTitle}>
                                About this Event
                            </SynthText>
                            <SynthText variant="body" color="secondary" style={styles.descriptionText}>
                                {event.description}
                            </SynthText>
                            <View style={styles.attributionWrap}>
                                <JamBaseAttributionInline />
                            </View>
                        </View>
                    ) : (
                        <View style={[styles.section, styles.attributionOnly]}>
                            <JamBaseAttributionInline />
                        </View>
                    )}

                    {/* Map */}
                    {event.latitude != null && event.longitude != null ? (
                        <View style={styles.section}>
                            <SynthText variant="h2" style={styles.sectionTitle}>
                                Map
                            </SynthText>
                            <SynthMap
                                latitude={event.latitude}
                                longitude={event.longitude}
                                title={event.venue_name}
                                subtitle={venueDetailLine(event) || event.venue_city || ''}
                                onPress={openInMaps}
                            />
                        </View>
                    ) : null}

                    {/* Reviews */}
                    <View style={styles.section}>
                        <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
                            <SynthText variant="h2" style={styles.sectionTitle}>
                                Reviews
                            </SynthText>
                            <Pressable
                                onPress={() => {
                                    if (!sessionUserId) {
                                        router.push('/(auth)/sign-in');
                                        return;
                                    }
                                    router.push(`/review-compose?eventId=${event.id}`);
                                }}
                            >
                                <SynthText variant="meta" style={styles.linkText}>
                                    Write one
                                </SynthText>
                            </Pressable>
                        </View>
                        {reviewsLoading ? (
                            <SynthText variant="meta" color="secondary">
                                Loading reviews…
                            </SynthText>
                        ) : reviews.length === 0 ? (
                            <SynthText variant="body" color="secondary">
                                No reviews yet.
                            </SynthText>
                        ) : (
                            <View style={{ marginTop: 8 }}>
                                {reviews.map(rv => (
                                    <NetworkReviewCard
                                        key={rv.id}
                                        review={rv}
                                        currentUserId={sessionUserId}
                                        onPress={() => router.push(`/review/${rv.id}`)}
                                    />
                                ))}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.lg,
    },
    linkText: {
        color: SynthTokens.colors.brandPink500,
        fontWeight: 'bold',
    },
    emptyBlock: {
        paddingHorizontal: SynthTokens.spacing.lg,
    },
    emptyTitle: {
        marginBottom: SynthTokens.spacing.sm,
    },
    emptyBody: {
        lineHeight: 22,
    },
    heroContainer: {
        width: '100%',
        height: HERO_HEIGHT,
    },
    heroImage: {
        ...StyleSheet.absoluteFillObject,
    },
    heroGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    navHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
        position: 'absolute',
        width: '100%',
        zIndex: 10,
    },
    circleButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroContent: {
        position: 'absolute',
        bottom: SynthTokens.spacing.xl,
        paddingHorizontal: SynthTokens.spacing.md,
    },
    heroTitle: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    heroSub: {
        opacity: 0.9,
        fontSize: 18,
    },
    detailsContainer: {
        paddingHorizontal: SynthTokens.spacing.md,
        marginTop: -20, // Pull up over hero
    },
    metadataCard: {
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: SynthTokens.radius.large,
        padding: SynthTokens.spacing.lg,
        gap: SynthTokens.spacing.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    metadataRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SynthTokens.spacing.md,
    },
    metadataTextCol: {
        flex: 1,
        minWidth: 0,
    },
    venueDetailLine: {
        marginTop: 4,
    },
    bold: {
        fontWeight: 'bold',
    },
    signInBanner: {
        marginTop: SynthTokens.spacing.md,
        padding: SynthTokens.spacing.md,
        borderRadius: SynthTokens.radius.medium,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1,
        borderColor: SynthTokens.colors.brandPink500,
    },
    signInBannerText: {
        color: SynthTokens.colors.brandPink600,
        fontWeight: '600',
        textAlign: 'center',
    },
    genreScroll: {
        marginTop: SynthTokens.spacing.md,
        maxHeight: 40,
    },
    genreScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: SynthTokens.spacing.md,
    },
    genrePill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: SynthTokens.radius.full,
        borderWidth: 1,
        borderColor: SynthTokens.colors.brandPink500,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    genrePillText: {
        fontSize: 13,
        fontWeight: '600',
        color: SynthTokens.colors.brandPink500,
    },
    attributionWrap: {
        marginTop: SynthTokens.spacing.md,
        alignItems: 'flex-start',
    },
    attributionOnly: {
        marginTop: SynthTokens.spacing.sm,
    },
    actionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SynthTokens.spacing.md,
        marginVertical: SynthTokens.spacing.xl,
    },
    section: {
        marginBottom: SynthTokens.spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SynthTokens.spacing.sm,
        marginBottom: SynthTokens.spacing.md,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    avatarsRow: {
        flexDirection: 'row',
        paddingLeft: 4,
    },
    avatarCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 3,
        borderColor: SynthTokens.colors.neutral50,
        marginLeft: -12, // Stacked effect
        overflow: 'hidden',
        backgroundColor: SynthTokens.colors.neutral200,
    },
    friendAvatar: {
        width: '100%',
        height: '100%',
    },
    moreCircle: {
        backgroundColor: SynthTokens.colors.neutral900,
        alignItems: 'center',
        justifyContent: 'center',
    },
    descriptionText: {
        lineHeight: 28,
    },
});
