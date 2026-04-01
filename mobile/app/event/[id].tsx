import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, Pressable, Share, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { EventService, EventDetail, FriendAttending } from '../../src/services/eventService';
import { supabase } from '../../src/integrations/supabase/client';
import { ChevronLeft, Share as ShareIcon, MapPin, Calendar, Users, Flag, Ticket, Heart } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { EventDetailsSkeleton } from '../../src/components/skeletons/EventDetailsSkeleton';
import { NetworkReviewCard } from '../../src/components/Feed/NetworkReviewCard';
import type { NetworkReview } from '../../src/services/homeFeedService';
import { SynthMap } from '../../src/components/maps/SynthMap';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.45;

export default function EventDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [event, setEvent] = useState<EventDetail | null>(null);
    const [friends, setFriends] = useState<FriendAttending[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGoing, setIsGoing] = useState(false);
    const [isInterested, setIsInterested] = useState(false);
    const [needsAuth, setNeedsAuth] = useState(false);
    const [reviews, setReviews] = useState<NetworkReview[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);

    useEffect(() => {
        void loadData();
    }, [id]);

    const loadData = async () => {
        setLoading(true);
        setNeedsAuth(false);
        setIsGoing(false);
        setIsInterested(false);
        setReviews([]);
        if (!id) {
            setEvent(null);
            setFriends([]);
            setLoading(false);
            return;
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            setNeedsAuth(true);
            setEvent(null);
            setFriends([]);
            setLoading(false);
            return;
        }

        const eventData = await EventService.getEventById(id);
        setEvent(eventData);

        if (eventData) {
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
            void loadReviewsForEvent(eventData.id, eventData);
        } else {
            setFriends([]);
            setReviews([]);
        }
        setLoading(false);
    };

    const loadReviewsForEvent = async (eventUuid: string, eventInfo: EventDetail) => {
        setReviewsLoading(true);
        try {
            const { data, error } = await supabase
                .from('reviews')
                .select(
                    `
          id,
          user_id,
          rating,
          review_text,
          photos,
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
            const mapped: NetworkReview[] = (data || []).map((rv: any) => ({
                id: String(rv.id),
                event_id: eventUuid,
                author: {
                    id: String(rv.user_id),
                    name: rv.users?.name || 'User',
                    avatar_url: rv.users?.avatar_url || undefined,
                },
                created_at: String(rv.created_at),
                rating: rv.rating != null ? Number(rv.rating) : undefined,
                content: rv.review_text || undefined,
                photos: Array.isArray(rv.photos) ? rv.photos : undefined,
                connection_degree: 1,
                event_info: {
                    artist_name: eventInfo.artist_name,
                    venue_name: eventInfo.venue_name,
                    event_date: eventInfo.event_date,
                },
            }));
            setReviews(mapped);
        } finally {
            setReviewsLoading(false);
        }
    };

    const handleShare = async () => {
        if (!event) return;
        try {
            await Share.share({
                message: `Check out ${event.artist_name} at ${event.venue_name}!`,
                url: event.ticket_url || 'https://synth.app',
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const handleToggleGoing = async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user || !event) return;

        const success = await EventService.toggleInteraction(user.id, event.id, 'going');
        if (success) {
            const next = !isGoing;
            setIsGoing(next);
            if (next) setIsInterested(false);
        }
    };

    const handleToggleInterested = async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user || !event) return;

        const success = await EventService.toggleInteraction(user.id, event.id, 'interested');
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
        const q = encodeURIComponent([event.venue_name, event.venue_address, event.venue_city].filter(Boolean).join(' '));
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
                        {needsAuth ? 'Sign in required' : 'Event not found'}
                    </SynthText>
                    <SynthText variant="body" color="secondary" style={styles.emptyBody}>
                        {needsAuth
                            ? 'Sign in to view event details and mark yourself as going.'
                            : 'This link may be invalid, or the event may have been removed.'}
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
                        <View style={styles.metadataRow}>
                            <MapPin size={18} color={SynthTokens.colors.brandPink500} />
                            <View>
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
                                <SynthText variant="meta" color="secondary">
                                    {event.venue_city}
                                </SynthText>
                            </View>
                        </View>
                    </BlurView>

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
                            onPress={() => router.push(`/review-compose?eventId=${event.id}`)}
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
                        </View>
                    ) : null}

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
                                subtitle={[event.venue_address, event.venue_city].filter(Boolean).join(' · ')}
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
                            <Pressable onPress={() => router.push(`/review-compose?eventId=${event.id}`)}>
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
        alignItems: 'center',
        gap: SynthTokens.spacing.md,
    },
    bold: {
        fontWeight: 'bold',
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
