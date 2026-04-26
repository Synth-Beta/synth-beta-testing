import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShareToChatModal } from '../../src/components/share/ShareToChatModal';
import { useInterested } from '../../src/contexts/InterestedContext';
import { StyleSheet, View, ScrollView, Dimensions, Pressable, Linking, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { EventService, EventDetail, FriendAttending } from '../../src/services/eventService';
import { supabase } from '../../src/integrations/supabase/client';
import {
    ChevronLeft,
    ChevronRight,
    Share as ShareIcon,
    Calendar,
    Users,
    Clock,
    Ticket,
    Music,
    Heart,
    Flag,
    MessageCircle,
    X,
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

interface MeetUser {
    user_id: string;
    name: string | null;
    avatar_url: string | null;
    bio: string | null;
}

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

    const { isInterested: isInterestedCtx, toggle: toggleInterested } = useInterested();

    const [event, setEvent] = useState<EventDetail | null>(null);
    const [friends, setFriends] = useState<FriendAttending[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviews, setReviews] = useState<NetworkReview[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [sessionUserId, setSessionUserId] = useState<string | null>(null);
    const [shareToChatOpen, setShareToChatOpen] = useState(false);

    // Social tabs
    const [activeTab, setActiveTab] = useState<'groups' | 'meet' | null>(null);

    // Group chat
    const [groupChat, setGroupChat] = useState<{ id: string; name: string; memberCount: number } | null>(null);
    const [groupChatLoading, setGroupChatLoading] = useState(false);
    const [isInGroupChat, setIsInGroupChat] = useState(false);
    const [joiningGroupChat, setJoiningGroupChat] = useState(false);

    const loadGroupChat = useCallback(async (eventId: string, eventTitle: string) => {
        setGroupChatLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_verified_chat_info', {
                p_entity_type: 'event',
                p_entity_id: eventId,
            });
            if (!error && data && data.length > 0) {
                const info = data[0];
                setGroupChat({
                    id: info.chat_id,
                    name: info.chat_name || `${eventTitle} Chat`,
                    memberCount: info.member_count || 0,
                });
                setIsInGroupChat(!!info.is_user_member);
            } else {
                setGroupChat(null);
                setIsInGroupChat(false);
            }
        } catch {
            setGroupChat(null);
        } finally {
            setGroupChatLoading(false);
        }
    }, []);

    const joinOrCreateGroupChat = useCallback(async () => {
        if (!sessionUserId || !event) return;
        setJoiningGroupChat(true);
        try {
            const eventId = event.id;
            const eventName = event.title || event.artist_name || 'Event';
            // Get or create the verified chat for this event
            const { data: chatId, error: createErr } = await supabase.rpc('get_or_create_verified_chat', {
                p_entity_type: 'event',
                p_entity_id: eventId,
                p_entity_name: eventName,
            });
            if (createErr) throw createErr;
            // Join if not already a member
            if (!isInGroupChat) {
                await supabase.rpc('join_verified_chat', {
                    p_chat_id: chatId,
                    p_user_id: sessionUserId,
                });
                setIsInGroupChat(true);
                setGroupChat(prev => prev
                    ? { ...prev, memberCount: prev.memberCount + 1 }
                    : { id: chatId, name: `${eventName} Chat`, memberCount: 1 });
            }
            router.push(`/chat/${chatId}` as any);
        } catch (err) {
            console.error('[event] join group chat error', err);
        } finally {
            setJoiningGroupChat(false);
        }
    }, [sessionUserId, event, isInGroupChat, router]);

    // Meet
    const [meetLoading, setMeetLoading] = useState(false);
    const [interestedCount, setInterestedCount] = useState<number | null>(null);
    const [allInterestedUsers, setAllInterestedUsers] = useState<MeetUser[]>([]);

    const loadMeetUsers = useCallback(async (eventId: string, uid: string) => {
        setMeetLoading(true);
        try {
            const { data: rels } = await supabase
                .from('user_event_relationships')
                .select('user_id')
                .eq('event_id', eventId)
                .in('relationship_type', ['interested', 'going', 'maybe'])
                .neq('user_id', uid);

            const allUserIds = (rels || []).map(r => r.user_id as string);
            setInterestedCount(allUserIds.length);

            if (allUserIds.length === 0) {
                setAllInterestedUsers([]);
                return;
            }

            const { data: profiles } = await supabase
                .from('users')
                .select('user_id, name, avatar_url, bio')
                .in('user_id', allUserIds)
                .limit(50);
            setAllInterestedUsers((profiles || []) as MeetUser[]);
        } catch (e) {
            console.error('[meet] loadMeetUsers', e);
        } finally {
            setMeetLoading(false);
        }
    }, []);


    const loadReviewsForEvent = useCallback(
        async (eventUuid: string, eventInfo: EventDetail, viewerId: string | null) => {
            setReviewsLoading(true);
            try {
                const reviewFields = `
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
              artist_performance_rating,
              production_rating,
              venue_rating,
              location_rating,
              value_rating,
              users:user_id (
                name,
                avatar_url
              )
            `;

                // Fetch reviews for this specific event
                const { data: eventReviews, error } = await supabase
                    .from('reviews')
                    .select(reviewFields)
                    .eq('event_id', eventUuid)
                    .order('created_at', { ascending: false })
                    .limit(10);

                // Also fetch artist reviews so all past reviews of this artist are visible
                const artistReviewsData: any[] = [];
                if (eventInfo.artist_id) {
                    const { data: artistRows } = await supabase
                        .from('reviews')
                        .select(reviewFields)
                        .eq('artist_id', eventInfo.artist_id)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    if (artistRows) artistReviewsData.push(...artistRows);
                }

                // Merge and deduplicate by review id
                const seenIds = new Set<string>();
                const merged: any[] = [];
                for (const r of [...(eventReviews ?? []), ...artistReviewsData]) {
                    if (!seenIds.has(String(r.id))) {
                        seenIds.add(String(r.id));
                        merged.push(r);
                    }
                }
                // Sort merged by created_at descending
                merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                const data = merged.slice(0, 15);
                if (error) {
                    // event-specific query failed; continue with any artist reviews we got
                    if (data.length === 0) { setReviews([]); return; }
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
                        artist_performance_rating: rv.artist_performance_rating != null ? Number(rv.artist_performance_rating) : undefined,
                        production_rating: rv.production_rating != null ? Number(rv.production_rating) : undefined,
                        venue_rating: rv.venue_rating != null ? Number(rv.venue_rating) : undefined,
                        location_rating: rv.location_rating != null ? Number(rv.location_rating) : undefined,
                        value_rating: rv.value_rating != null ? Number(rv.value_rating) : undefined,
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
        setReviews([]);
        setFriends([]);
        setSessionUserId(null);
        setAllInterestedUsers([]);
        setInterestedCount(null);
        setActiveTab(null);

        if (!eventRouteId) {
            setEvent(null);
            setLoading(false);
            return;
        }

        const eventData = await EventService.getEventById(eventRouteId);
        setEvent(eventData);

        const {
            data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;

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

        const friendsData = await EventService.getFriendsAttending(eventData.id, user.id);
        setFriends(friendsData);
        void loadReviewsForEvent(eventData.id, eventData, user.id);

        // Pre-load interested count for the Meet tab badge
        const isUpcoming = eventData.event_date ? new Date(eventData.event_date) >= new Date() : false;
        if (isUpcoming) {
            void loadMeetUsers(eventData.id, user.id);
        }

        setLoading(false);
    }, [eventRouteId, loadReviewsForEvent, loadMeetUsers]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleShare = () => {
        if (!event) return;
        if (sessionUserId) {
            setShareToChatOpen(true);
            return;
        }
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

    const handleToggleInterested = useCallback(async () => {
        if (!sessionUserId) {
            router.push('/(auth)/sign-in');
            return;
        }
        if (!event) return;
        await toggleInterested(event.id);
    }, [sessionUserId, event, toggleInterested, router]);

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
                    <SynthText variant="meta" color="primary">Back</SynthText>
                </Pressable>
                <View style={styles.emptyBlock}>
                    <SynthText variant="h2" style={styles.emptyTitle}>Event not found</SynthText>
                    <SynthText variant="body" color="secondary" style={styles.emptyBody}>
                        This link may be invalid, or the event may have been removed.
                    </SynthText>
                </View>
            </View>
        );
    }

    const isPastEvent = event.event_date ? new Date(event.event_date) < new Date() : false;
    const isUpcomingEvent = !isPastEvent;
    const isInterested = isInterestedCtx(event.id);
    const priceLine = formatEventDetailPrice(event);
    const doorsShort = formatDoorsTimeShort(event.doors_time);
    const showTimePrimary = formatEventDetailTime(event.event_date);
    const handleTabPress = (tab: 'groups' | 'meet') => {
        const isOpening = activeTab !== tab;
        setActiveTab(prev => (prev === tab ? null : tab));
        if (isOpening && tab === 'groups' && event && !groupChatLoading) {
            void loadGroupChat(event.id, event.title || event.artist_name || 'Event');
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Hero */}
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
                    {/* Title */}
                    <SynthText variant="h2" color="primary" style={styles.pageTitle}>
                        {event.title}
                    </SynthText>

                    {/* Interested + Report */}
                    <View style={styles.primaryActionRow}>
                        {isUpcomingEvent ? (
                            <Pressable
                                onPress={() => void handleToggleInterested()}
                                style={[styles.outlineAction, isInterested && styles.outlineActionActive]}
                                accessibilityRole="button"
                                accessibilityLabel={isInterested ? 'Interested' : "I'm Interested"}
                            >
                                <Heart
                                    size={22}
                                    color={isInterested ? SynthTokens.colors.neutral0 : PINK}
                                    fill={isInterested ? SynthTokens.colors.neutral0 : 'transparent'}
                                />
                                <Text style={[styles.outlineActionText, isInterested && styles.outlineActionTextOn]} numberOfLines={1}>
                                    {isInterested ? 'Interested' : "I'm Interested"}
                                </Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            onPress={() => void reportEvent()}
                            style={[styles.outlineAction, !isUpcomingEvent && styles.outlineActionSingle]}
                            accessibilityRole="button"
                            accessibilityLabel="Report event"
                        >
                            <Flag size={22} color={PINK} />
                            <Text style={styles.outlineActionText}>Report</Text>
                        </Pressable>
                    </View>

                    {/* Info card */}
                    <View style={styles.infoCard}>
                        <View style={styles.infoRow}>
                            <View style={styles.infoIconWrap}><Calendar size={22} color={PINK} /></View>
                            <SynthText variant="body" color="primary" style={styles.infoRowText}>
                                {formatEventDetailDate(event.event_date)}
                            </SynthText>
                        </View>
                        <View style={styles.infoRow}>
                            <View style={styles.infoIconWrap}><Clock size={22} color={PINK} /></View>
                            <Text style={styles.infoRowTextPlain}>
                                <Text style={styles.infoRowTextStrong}>{showTimePrimary || 'Time TBA'}</Text>
                                {doorsShort ? <Text style={styles.infoRowTextMuted}> Doors: {doorsShort}</Text> : null}
                            </Text>
                        </View>
                        {event.tour_name?.trim() ? (
                            <View style={styles.infoRow}>
                                <View style={styles.infoIconWrap}><Music size={22} color={PINK} /></View>
                                <SynthText variant="body" color="primary" style={styles.infoRowText}>
                                    {event.tour_name.trim()}
                                </SynthText>
                            </View>
                        ) : null}
                    </View>

                    {/* Artist card */}
                    {event.artist_name ? (
                        <Pressable
                            style={styles.entityCard}
                            onPress={event.artist_id ? () => {
                                // Navigate with the raw artist_id so the artist page can find events
                                // that store this same ID (JamBase UUID or canonical UUID).
                                router.push(`/artist/${event.artist_id}` as any);
                            } : undefined}
                            accessibilityRole="button"
                            accessibilityLabel={`Artist ${event.artist_name}`}
                        >
                            <View style={styles.entityCardHeader}>
                                <Music size={16} color={PINK} />
                                <SynthText variant="meta" style={styles.entityCardLabel}>Artist</SynthText>
                            </View>
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

                    {/* Venue card */}
                    {(event.venue_name || event.venue_id) ? (
                        <Pressable
                            style={styles.entityCard}
                            onPress={event.venue_id ? () => {
                                // Navigate with the raw venue_id so the venue page can find events
                                // that store this same ID (JamBase UUID or canonical UUID).
                                router.push(`/venue/${event.venue_id}` as any);
                            } : undefined}
                            accessibilityRole="button"
                            accessibilityLabel={`Venue ${event.venue_name || event.venue_city || 'venue'}`}
                        >
                            <View style={styles.entityCardHeader}>
                                <Ticket size={16} color={PINK} />
                                <SynthText variant="meta" style={styles.entityCardLabel}>Venue</SynthText>
                            </View>
                            <SynthText variant="body" color="primary" style={styles.entityCardTitle}>
                                {event.venue_name || event.venue_city || 'Venue'}
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

                    {/* Sign in banner */}
                    {!sessionUserId ? (
                        <Pressable
                            onPress={() => router.push('/(auth)/sign-in')}
                            style={styles.signInBanner}
                            accessibilityRole="button"
                        >
                            <SynthText variant="meta" style={styles.signInBannerText}>
                                Sign in to mark Interested, see friends going, and write reviews.
                            </SynthText>
                        </Pressable>
                    ) : null}

                    {/* Reviews (moved up, just below venue) */}
                    <View style={styles.section}>
                        <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
                            <SynthText variant="h2" style={styles.sectionTitle}>
                                Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
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
                                <SynthText variant="meta" style={styles.linkText}>Write one</SynthText>
                            </Pressable>
                        </View>
                        {reviewsLoading ? (
                            <ActivityIndicator color={PINK} style={{ marginTop: 8 }} />
                        ) : reviews.length === 0 ? (
                            <SynthText variant="body" color="secondary">No reviews yet.</SynthText>
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

                    {/* Social tabs: Groups + Meet */}
                    <View style={styles.section}>
                        {/* Tab bar */}
                        <View style={styles.tabBar}>
                            <Pressable
                                style={[styles.tab, activeTab === 'groups' && styles.tabActive]}
                                onPress={() => handleTabPress('groups')}
                                accessibilityRole="tab"
                            >
                                <MessageCircle size={16} color={activeTab === 'groups' ? SynthTokens.colors.neutral0 : SynthTokens.colors.neutral600} />
                                <Text style={[styles.tabText, activeTab === 'groups' && styles.tabTextActive]}>
                                    Groups
                                </Text>
                            </Pressable>
                            {isUpcomingEvent && (
                                <Pressable
                                    style={[styles.tab, activeTab === 'meet' && styles.tabActive]}
                                    onPress={() => handleTabPress('meet')}
                                    accessibilityRole="tab"
                                >
                                    <Heart
                                        size={16}
                                        color={activeTab === 'meet' ? SynthTokens.colors.neutral0 : SynthTokens.colors.neutral600}
                                    />
                                    <Text style={[styles.tabText, activeTab === 'meet' && styles.tabTextActive]}>
                                        Meet{interestedCount != null ? ` (${interestedCount})` : ''}
                                    </Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Groups: Event Group Chat */}
                        {activeTab === 'groups' && (
                            <View style={styles.tabContent}>
                                {!sessionUserId ? (
                                    <Pressable style={styles.signInBanner} onPress={() => router.push('/(auth)/sign-in')}>
                                        <SynthText variant="meta" style={styles.signInBannerText}>
                                            Sign in to join the group chat for this event.
                                        </SynthText>
                                    </Pressable>
                                ) : groupChatLoading ? (
                                    <ActivityIndicator color={PINK} size="large" style={{ paddingVertical: 32 }} />
                                ) : (
                                    <View style={styles.groupChatCard}>
                                        <MessageCircle size={36} color={PINK} />
                                        <Text style={styles.groupChatTitle}>
                                            {groupChat?.name ?? `${event?.title || event?.artist_name || 'Event'} Chat`}
                                        </Text>
                                        {groupChat && (
                                            <SynthText variant="meta" color="secondary" style={{ marginBottom: 4 }}>
                                                {groupChat.memberCount === 1 ? '1 member' : `${groupChat.memberCount} members`}
                                            </SynthText>
                                        )}
                                        <Pressable
                                            onPress={() => void joinOrCreateGroupChat()}
                                            disabled={joiningGroupChat}
                                            style={[styles.groupChatBtn, isInGroupChat && styles.groupChatBtnOpen]}
                                        >
                                            {joiningGroupChat ? (
                                                <ActivityIndicator size="small" color={SynthTokens.colors.neutral0} />
                                            ) : (
                                                <Text style={styles.groupChatBtnTxt}>
                                                    {isInGroupChat ? 'Open Chat' : groupChat ? 'Join Chat' : 'Start Group Chat'}
                                                </Text>
                                            )}
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Meet — list of all interested users */}
                        {activeTab === 'meet' && isUpcomingEvent && (
                            <View style={styles.tabContent}>
                                {!sessionUserId ? (
                                    <Pressable
                                        style={styles.signInBanner}
                                        onPress={() => router.push('/(auth)/sign-in')}
                                    >
                                        <SynthText variant="meta" style={styles.signInBannerText}>
                                            Sign in to see who is interested in this event.
                                        </SynthText>
                                    </Pressable>
                                ) : meetLoading ? (
                                    <ActivityIndicator color={PINK} size="large" style={{ paddingVertical: 32 }} />
                                ) : allInterestedUsers.length === 0 ? (
                                    <View style={styles.meetEmptyWrap}>
                                        <Heart size={52} color={SynthTokens.colors.neutral400} />
                                        <Text style={styles.comingSoonTitle}>No One Yet</Text>
                                        <SynthText variant="meta" color="secondary" style={styles.comingSoonDesc}>
                                            Be the first to mark yourself as interested and share with friends!
                                        </SynthText>
                                    </View>
                                ) : (
                                    <View>
                                        <SynthText variant="meta" color="secondary" style={styles.meetListHeader}>
                                            {interestedCount} {interestedCount === 1 ? 'person' : 'people'} interested — tap to view their profile
                                        </SynthText>
                                        {allInterestedUsers.map(u => (
                                            <Pressable
                                                key={u.user_id}
                                                style={({ pressed }) => [styles.meetListRow, pressed && { opacity: 0.7 }]}
                                                onPress={() => router.push(`/user/${u.user_id}` as any)}
                                            >
                                                {u.avatar_url ? (
                                                    <Image source={{ uri: u.avatar_url }} style={styles.meetListAvatar} contentFit="cover" />
                                                ) : (
                                                    <View style={[styles.meetListAvatar, styles.meetListAvatarPlaceholder]}>
                                                        <Text style={styles.meetListAvatarInitial}>{u.name?.charAt(0).toUpperCase() || '?'}</Text>
                                                    </View>
                                                )}
                                                <View style={styles.meetListInfo}>
                                                    <Text style={styles.meetListName}>{u.name || 'Synth User'}</Text>
                                                    {u.bio ? (
                                                        <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.meetListBio}>
                                                            {u.bio}
                                                        </SynthText>
                                                    ) : null}
                                                </View>
                                                <ChevronRight size={18} color={SynthTokens.colors.neutral400} />
                                            </Pressable>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Friends going */}
                    {friends.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Users size={20} color={SynthTokens.colors.neutral900} />
                                <SynthText variant="h2" style={styles.sectionTitle}>Friends Going</SynthText>
                            </View>
                            <View style={styles.avatarsRow}>
                                {friends.slice(0, 5).map(friend => (
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
                                        <SynthText variant="meta" color="white">+{friends.length - 5}</SynthText>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Description */}
                    {event.description ? (
                        <View style={styles.section}>
                            <SynthText variant="h2" style={styles.sectionTitle}>About this Event</SynthText>
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

                    {/* Location */}
                    {event.latitude != null && event.longitude != null ? (
                        <View style={styles.section}>
                            <SynthText variant="h2" style={styles.sectionTitle}>Location</SynthText>
                            <SynthMap
                                latitude={event.latitude}
                                longitude={event.longitude}
                                title={event.venue_name}
                                subtitle={mapSubtitleLine(event) || event.venue_city || ''}
                                onPress={openInMaps}
                            />
                        </View>
                    ) : null}

                    {/* Price + Get Tickets (upcoming events) */}
                    {isUpcomingEvent && event.ticket_url ? (
                        <View style={styles.ticketSection}>
                            {priceLine ? (
                                <View style={styles.priceLine}>
                                    <Ticket size={18} color={SynthTokens.colors.neutral600} />
                                    <Text style={styles.priceText}>{priceLine}</Text>
                                </View>
                            ) : null}
                            <Pressable
                                style={styles.ticketBtn}
                                onPress={() => void openTicketLink()}
                                accessibilityRole="button"
                                accessibilityLabel="Get Tickets"
                            >
                                <Ticket size={20} color={SynthTokens.colors.neutral0} />
                                <Text style={styles.ticketBtnText}>Get Tickets</Text>
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            </ScrollView>

            {sessionUserId && event ? (
                <ShareToChatModal
                    visible={shareToChatOpen}
                    onClose={() => setShareToChatOpen(false)}
                    type="event"
                    entityId={event.id}
                    title={
                        event.title?.trim() ||
                        `${event.artist_name || 'Show'}${event.venue_name ? ` at ${event.venue_name}` : ''}`
                    }
                    currentUserId={sessionUserId}
                />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.lg,
    },
    linkText: {
        color: PINK,
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
    entityCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    entityCardLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: PINK,
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
        marginBottom: SynthTokens.spacing.md,
        padding: SynthTokens.spacing.md,
        borderRadius: SynthTokens.radius.medium,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1,
        borderColor: PINK,
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
        marginLeft: -12,
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
    // Tabs
    tabBar: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1.5,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    tabActive: {
        backgroundColor: PINK,
        borderColor: PINK,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
    },
    tabTextActive: {
        color: SynthTokens.colors.neutral0,
    },
    tabContent: {
        alignItems: 'center',
        paddingVertical: 32,
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        paddingHorizontal: 24,
        gap: 8,
    },
    comingSoonTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
        textAlign: 'center',
        marginTop: 4,
    },
    comingSoonDesc: {
        textAlign: 'center',
        lineHeight: 20,
    },
    // Group chat
    groupChatCard: {
        width: '100%',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
    },
    groupChatTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
        textAlign: 'center',
    },
    groupChatBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: SynthTokens.radius.corner,
        backgroundColor: PINK,
        marginTop: 4,
        minWidth: 180,
    },
    groupChatBtnOpen: {
        backgroundColor: SynthTokens.colors.neutral900,
    },
    groupChatBtnTxt: {
        fontSize: 16,
        fontWeight: '700',
        color: SynthTokens.colors.neutral0,
    },
    // Meet
    meetEmptyWrap: {
        alignItems: 'center',
        gap: 8,
        width: '100%',
    },
    guestListGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
    },
    guestChip: {
        alignItems: 'center',
        width: 64,
        gap: 4,
    },
    guestChipAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: 'hidden',
    },
    guestChipAvatarPlaceholder: {
        backgroundColor: SynthTokens.colors.brandPink500,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestChipInitial: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '700',
        fontSize: 16,
    },
    guestChipName: {
        fontSize: 11,
        color: SynthTokens.colors.neutral600,
        textAlign: 'center',
        maxWidth: 64,
    },
    meetListHeader: {
        marginBottom: 12,
        textAlign: 'center',
    },
    meetListRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: SynthTokens.colors.neutral200,
        gap: 12,
    },
    meetListAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: 'hidden',
        flexShrink: 0,
    },
    meetListAvatarPlaceholder: {
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
    meetListAvatarInitial: {
        fontSize: 18,
        fontWeight: '700',
        color: SynthTokens.colors.neutral0,
    },
    meetListInfo: {
        flex: 1,
        gap: 2,
    },
    meetListName: {
        fontSize: 15,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    meetListBio: {
        fontSize: 13,
    },
    // Ticket section at bottom
    ticketSection: {
        marginBottom: SynthTokens.spacing.xl,
        gap: 10,
    },
    priceLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    priceText: {
        fontSize: 15,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
    },
    ticketBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: PINK,
        paddingVertical: 15,
        borderRadius: SynthTokens.radius.medium,
        minHeight: 50,
    },
    ticketBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: SynthTokens.colors.neutral0,
    },
});
