import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert, StyleSheet, View, ScrollView, Dimensions, Pressable, Linking, Text } from 'react-native';
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
    Calendar,
    Users,
    Clock,
    Ticket,
    Music,
    Heart,
    Flag,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventDetailsSkeleton } from '../../src/components/skeletons/EventDetailsSkeleton';
import { NetworkReviewCard } from '../../src/components/Feed/NetworkReviewCard';
import type { NetworkReview } from '../../src/services/homeFeedService';
import { ReviewEngagementService } from '../../src/services/reviewEngagementService';
import { SynthMap } from '../../src/components/maps/SynthMap';
import { JamBaseAttributionInline } from '../../src/components/Feed/JamBaseAttributionInline';
import {
    formatEventDetailDate,
    formatEventDetailTime,
    formatDoorsTimeShort,
    formatEventDetailPrice,
    venueAddressPrimaryLine,
} from '../../src/utils/eventDetailFormat';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.38;

const PINK = SynthTokens.colors.brandPink500;

function mapSubtitleLine(e: EventDetail): string {
    const cityState = [e.venue_city, e.venue_state].filter(Boolean).join(', ');
    const parts = [e.venue_address?.trim(), cityState].filter(p => p && p.length > 0);
    return parts.join(' · ') || e.venue_city || '';
}

function firstRouteSegment(id: string | string[] | undefined): string | undefined {
    const raw = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;
    if (raw == null) return undefined;
    const s = String(raw).trim();
    return s.length > 0 ? s : undefined;
}

export default function EventDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string | string[] }>();
    const eventRouteId = useMemo(() => firstRouteSegment(id), [id]);
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

    const loadReviewsForEvent = useCallback(
        async (eventUuid: string, eventInfo: EventDetail, viewerId: string | null) => {
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
        },
        []
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        setIsGoing(false);
        setIsInterested(false);
        setReviews([]);
        setFriends([]);
        setSessionUserId(null);

        if (!eventRouteId) {
            setEvent(null);
            setLoading(false);
            return;
        }

        const eventData = await EventService.getEventById(eventRouteId);
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
    }, [eventRouteId, loadReviewsForEvent]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

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

    const isPastEvent = event.event_date ? new Date(event.event_date) < new Date() : false;
    const isUpcomingEvent = !isPastEvent;
    const priceLine = formatEventDetailPrice(event);
    const doorsShort = formatDoorsTimeShort(event.doors_time);
    const showTimePrimary = formatEventDetailTime(event.event_date);

    const onInterestedOutline = () => {
        if (!sessionUserId) {
            router.push('/(auth)/sign-in');
            return;
        }
        void handleToggleInterested();
    };

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.heroContainer}>
                    <Image
                        source={event.image_url ? { uri: event.image_url } : require('../../assets/Synth_Placeholder.png')}
                        style={styles.heroImage}
                        contentFit="cover"
                    />
                    <LinearGradient
                        colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.55)']}
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
                </View>

                <View style={styles.detailsContainer}>
                    <SynthText variant="h2" color="primary" style={styles.pageTitle}>
                        {event.title}
                    </SynthText>

                    <View style={styles.primaryActionRow}>
                        {isUpcomingEvent ? (
                            <Pressable
                                onPress={onInterestedOutline}
                                style={[styles.outlineAction, isInterested && styles.outlineActionActive]}
                                accessibilityRole="button"
                                accessibilityLabel={isInterested ? 'Interested' : "I'm Interested"}
                            >
                                <Heart
                                    size={22}
                                    color={isInterested ? SynthTokens.colors.neutral0 : PINK}
                                    fill={isInterested ? SynthTokens.colors.neutral0 : 'transparent'}
                                />
                                <Text
                                    style={[styles.outlineActionText, isInterested && styles.outlineActionTextOn]}
                                    numberOfLines={1}
                                >
                                    {isInterested ? 'Interested' : "I'm Interested"}
                                </Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            onPress={reportEvent}
                            style={[styles.outlineAction, !isUpcomingEvent && styles.outlineActionSingle]}
                            accessibilityRole="button"
                            accessibilityLabel="Report event"
                        >
                            <Flag size={22} color={PINK} />
                            <Text style={styles.outlineActionText}>Report</Text>
                        </Pressable>
                    </View>

                    <View style={styles.infoCard}>
                        <View style={styles.infoRow}>
                            <View style={styles.infoIconWrap}>
                                <Calendar size={22} color={PINK} />
                            </View>
                            <SynthText variant="body" color="primary" style={styles.infoRowText}>
                                {formatEventDetailDate(event.event_date)}
                            </SynthText>
                        </View>
                        <View style={styles.infoRow}>
                            <View style={styles.infoIconWrap}>
                                <Clock size={22} color={PINK} />
                            </View>
                            <Text style={styles.infoRowTextPlain}>
                                <Text style={styles.infoRowTextStrong}>
                                    {showTimePrimary || 'Time TBA'}
                                </Text>
                                {doorsShort ? (
                                    <Text style={styles.infoRowTextMuted}> Doors: {doorsShort}</Text>
                                ) : null}
                            </Text>
                        </View>
                        {priceLine ? (
                            <View style={styles.infoRow}>
                                <View style={styles.infoIconWrap}>
                                    <Ticket size={22} color={PINK} />
                                </View>
                                <SynthText variant="body" color="primary" style={styles.infoPriceText}>
                                    {priceLine}
                                </SynthText>
                            </View>
                        ) : null}
                        {event.tour_name?.trim() ? (
                            <View style={styles.infoRow}>
                                <View style={styles.infoIconWrap}>
                                    <Music size={22} color={PINK} />
                                </View>
                                <SynthText variant="body" color="primary" style={styles.infoRowText}>
                                    {event.tour_name.trim()}
                                </SynthText>
                            </View>
                        ) : null}
                    </View>

                    {event.artist_name && event.artist_id ? (
                        <Pressable
                            style={styles.entityCard}
                            onPress={() => {
                                void EventService.resolveCanonicalArtistId(String(event.artist_id)).then((resolved) => {
                                    if (!resolved) {
                                        Alert.alert(
                                            'Artist unavailable',
                                            'This artist link could not be opened. Please try another event.'
                                        );
                                        return;
                                    }
                                    router.push(`/artist/${resolved}`);
                                });
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Artist ${event.artist_name}`}
                        >
                            <SynthText variant="body" color="primary" style={styles.entityCardTitle}>
                                {event.artist_name}
                            </SynthText>
                            {event.genres && event.genres.length > 0 ? (
                                <View style={styles.genreRow}>
                                    {event.genres.slice(0, 3).map(g => (
                                        <View key={g} style={styles.genrePillCard}>
                                            <Text style={styles.genrePillCardText}>{g}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </Pressable>
                    ) : null}

                    {event.venue_name && event.venue_id ? (
                        <Pressable
                            style={styles.entityCard}
                            onPress={() => {
                                void EventService.resolveCanonicalVenueId(String(event.venue_id)).then((resolved) => {
                                    if (!resolved) {
                                        Alert.alert(
                                            'Venue unavailable',
                                            'This venue link could not be opened. Please try another event.'
                                        );
                                        return;
                                    }
                                    router.push(`/venue/${resolved}`);
                                });
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Venue ${event.venue_name}`}
                        >
                            <SynthText variant="body" color="primary" style={styles.entityCardTitle}>
                                {event.venue_name}
                            </SynthText>
                            <SynthText variant="meta" color="secondary" style={styles.venueCardAddress}>
                                {venueAddressPrimaryLine(event)}
                            </SynthText>
                            {event.venue_zip ? (
                                <SynthText variant="meta" color="secondary" style={styles.venueCardZip}>
                                    ZIP: {event.venue_zip}
                                </SynthText>
                            ) : null}
                        </Pressable>
                    ) : null}

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

                    <View style={styles.actionRow}>
                        <SynthButton
                            title={isGoing ? "You're Going!" : 'Going'}
                            variant={isGoing ? 'primary' : 'secondary'}
                            onPress={handleToggleGoing}
                            style={{ flex: 1, minWidth: '30%' }}
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
                            style={{ flex: 1, minWidth: '30%' }}
                        />
                        <SynthButton
                            title="Tickets"
                            variant="secondary"
                            onPress={openTicketLink}
                            style={{ flex: 1, minWidth: '30%' }}
                            disabled={!event.ticket_url}
                        />
                        <SynthButton
                            title="Map"
                            variant="secondary"
                            onPress={openInMaps}
                            style={{ flex: 1, minWidth: '30%' }}
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
                                subtitle={mapSubtitleLine(event) || event.venue_city || ''}
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
    pageTitle: {
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 28,
        marginBottom: SynthTokens.spacing.md,
    },
    primaryActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: SynthTokens.spacing.lg,
    },
    outlineAction: {
        flex: 1,
        minWidth: '42%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1.5,
        borderColor: PINK,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    outlineActionSingle: {
        flex: 1,
        minWidth: '100%',
    },
    outlineActionActive: {
        backgroundColor: PINK,
        borderColor: PINK,
    },
    outlineActionText: {
        fontSize: 15,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
        flexShrink: 1,
    },
    outlineActionTextOn: {
        color: SynthTokens.colors.neutral0,
    },
    infoCard: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        padding: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.md,
        gap: 12,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(204, 36, 134, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoRowText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
    },
    infoRowTextPlain: {
        flex: 1,
        fontSize: 16,
        color: SynthTokens.colors.neutral900,
    },
    infoRowTextStrong: {
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    infoRowTextMuted: {
        color: SynthTokens.colors.neutral600,
        fontWeight: '500',
    },
    infoPriceText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '700',
    },
    entityCard: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        padding: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.md,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    entityCardTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    genreRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    genrePillCard: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: SynthTokens.radius.corner,
        backgroundColor: SynthTokens.colors.neutral100,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
    },
    genrePillCardText: {
        fontSize: 14,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    venueCardAddress: {
        fontSize: 14,
        lineHeight: 20,
    },
    venueCardZip: {
        fontSize: 13,
        marginTop: 4,
        color: SynthTokens.colors.neutral600,
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
    detailsContainer: {
        paddingHorizontal: SynthTokens.spacing.md,
        marginTop: -16,
        paddingBottom: SynthTokens.spacing.xl,
        backgroundColor: SynthTokens.colors.neutral50,
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
