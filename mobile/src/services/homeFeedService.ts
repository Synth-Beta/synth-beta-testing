import { getSimilarUsersToFriend, rankFriendSuggestionsForRail } from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

/** Single event row from personalized feed RPC (unified recommended / social / trending ordering). */
export interface UnifiedPersonalizedEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    /** Short label for corner badge (e.g. RECOMMENDED) derived from RPC context */
    feedLabel?: string;
}

export interface NetworkReview {
    id: string;
    event_id?: string;
    author: {
        id: string;
        name: string;
        avatar_url?: string;
    };
    created_at: string;
    rating?: number;
    content?: string;
    photos?: string[];
    artist_image_url?: string;
    event_info?: {
        artist_name?: string;
        venue_name?: string;
        event_date?: string;
    };
    connection_degree: 1 | 2;
}

export interface NetworkEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    friend_id: string;
    friend_name: string;
    friend_avatar?: string;
    action_type: 'going' | 'interested' | 'reviewed';
}

export interface TrendingEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    trending_score: number;
    interest_count: number;
}

/** Same shape as web + {@link @synth/shared#SharedFriendSuggestion}. */
export interface FriendSuggestion {
    user_id: string;
    name: string;
    avatar_url: string | null;
    verified?: boolean;
    connection_depth: number;
    mutual_friends_count: number;
    shared_genres_count?: number;
}

export class HomeFeedService {
    /**
     * Unified home events feed (matches web reliance on get_personalized_feed_v3).
     */
    static async getUnifiedPersonalizedEvents(
        userId: string,
        limit = 50,
        cityLat: number | null = null,
        cityLng: number | null = null,
        radiusMiles = 50
    ): Promise<UnifiedPersonalizedEvent[]> {
        try {
            const { data, error } = await supabase.rpc('get_personalized_feed_v3', {
                p_user_id: userId,
                p_limit: limit,
                p_offset: 0,
                p_city_lat: cityLat,
                p_city_lng: cityLng,
                p_radius_miles: radiusMiles,
            });

            if (error) {
                console.warn('[homeFeed] get_personalized_feed_v3:', error.message);
                return await this.getFallbackUpcomingEvents(limit);
            }

            const rows = (data ?? []).filter((r: { type?: string }) => r.type === 'event');
            const mapped: UnifiedPersonalizedEvent[] = rows.map((row: any) => {
                const payload = row.payload || {};
                const because = row.context?.because as string | undefined;
                const feedLabel =
                    typeof because === 'string' && because.toLowerCase().includes('suggested')
                        ? 'RECOMMENDED'
                        : typeof because === 'string' && because.toLowerCase().includes('friend')
                          ? 'FRIENDS'
                          : undefined;

                const imgs = payload.images;
                const image_url = Array.isArray(imgs) && imgs[0]?.url ? imgs[0].url : payload.poster_image_url;

                return {
                    id: (payload.event_id as string) || (row.id as string),
                    title: (payload.title as string) || '',
                    artist_name: (payload.artist_name as string) || '',
                    venue_name: (payload.venue_name as string) || '',
                    event_date: (payload.event_date as string) || '',
                    image_url,
                    feedLabel,
                };
            });

            if (mapped.length === 0) {
                return await this.getFallbackUpcomingEvents(limit);
            }

            return mapped;
        } catch (e) {
            console.error('[homeFeed] getUnifiedPersonalizedEvents', e);
            return await this.getFallbackUpcomingEvents(limit);
        }
    }

    private static async getFallbackUpcomingEvents(limit: number): Promise<UnifiedPersonalizedEvent[]> {
        const { data, error } = await supabase
            .from('events')
            .select('id, title, artist_name, venue_name, event_date, images')
            .gte('event_date', new Date().toISOString())
            .order('event_date', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('[homeFeed] fallback events', error);
            return [];
        }

        return (data || []).map((event: any) => ({
            id: event.id,
            title: event.title || '',
            artist_name: event.artist_name || '',
            venue_name: event.venue_name || '',
            event_date: event.event_date || '',
            image_url: event.images?.[0]?.url,
            feedLabel: undefined,
        }));
    }

    /**
     * Reviews from friends (same logic as web HomeFeedService.getNetworkReviews).
     */
    static async getNetworkReviews(userId: string, limit = 20): Promise<NetworkReview[]> {
        try {
            const { data: friends, error: friendsError } = await supabase
                .from('user_relationships')
                .select('user_id, related_user_id')
                .eq('relationship_type', 'friend')
                .eq('status', 'accepted')
                .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

            if (friendsError) throw friendsError;
            if (!friends?.length) return [];

            const friendIds = friends.map(f => (f.user_id === userId ? f.related_user_id : f.user_id));

            const { data: reviews, error: reviewsError } = await supabase
                .from('reviews')
                .select(
                    `
          id,
          user_id,
          event_id,
          artist_id,
          venue_id,
          rating,
          review_text,
          photos,
          created_at,
          events (
            id,
            title,
            event_date,
            artist_id,
            venue_id
          )
        `
                )
                .in('user_id', friendIds)
                .eq('is_public', true)
                .eq('is_draft', false)
                .neq('review_text', 'ATTENDANCE_ONLY')
                .not('review_text', 'is', null)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (reviewsError) throw reviewsError;
            if (!reviews?.length) return [];

            const userIds = [...new Set(reviews.map((r: { user_id: string }) => r.user_id))];
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('user_id, name, avatar_url')
                .in('user_id', userIds);

            if (usersError) throw usersError;

            const usersMap = new Map<string, { name: string | null; avatar_url: string | null }>();
            users?.forEach(u => usersMap.set(u.user_id, { name: u.name, avatar_url: u.avatar_url }));

            const artistIds = new Set<string>();
            const venueIds = new Set<string>();
            reviews.forEach((review: any) => {
                if (review.artist_id) artistIds.add(review.artist_id);
                if (review.venue_id) venueIds.add(review.venue_id);
                if (review.events?.artist_id) artistIds.add(review.events.artist_id);
                if (review.events?.venue_id) venueIds.add(review.events.venue_id);
            });

            const artistsMap = new Map<string, { name: string; image_url: string | null }>();
            const venuesMap = new Map<string, string>();

            if (artistIds.size > 0) {
                const { data: artists } = await supabase
                    .from('artists')
                    .select('id, name, image_url')
                    .in('id', Array.from(artistIds));
                artists?.forEach(a => artistsMap.set(a.id, { name: a.name, image_url: a.image_url }));
            }

            if (venueIds.size > 0) {
                const { data: venues } = await supabase
                    .from('venues')
                    .select('id, name')
                    .in('id', Array.from(venueIds));
                venues?.forEach(v => venuesMap.set(v.id, v.name));
            }

            return reviews
                .filter((review: any) => usersMap.has(review.user_id))
                .map((review: any) => {
                    const user = usersMap.get(review.user_id)!;
                    const artistId = review.artist_id || review.events?.artist_id;
                    const venueId = review.venue_id || review.events?.venue_id;
                    const artistData = artistId ? artistsMap.get(artistId) : undefined;
                    const venueName = venueId ? venuesMap.get(venueId) : undefined;

                    return {
                        id: review.id,
                        event_id: review.event_id || review.events?.id,
                        author: {
                            id: review.user_id,
                            name: user.name || 'User',
                            avatar_url: user.avatar_url || undefined,
                        },
                        created_at: review.created_at,
                        rating: review.rating ?? undefined,
                        content: review.review_text ?? undefined,
                        photos: review.photos ?? undefined,
                        artist_image_url: artistData?.image_url || undefined,
                        event_info: {
                            artist_name: artistData?.name,
                            venue_name: venueName,
                            event_date: review.events?.event_date,
                        },
                        connection_degree: 1 as const,
                    };
                });
        } catch (error) {
            console.error('[homeFeed] getNetworkReviews', error);
            return [];
        }
    }

    /**
     * Get events attended/interested by friends (1st degree)
     */
    static async getNetworkEvents(userId: string): Promise<NetworkEvent[]> {
        try {
            // 1. Get friends
            const { data: friends } = await supabase
                .from('user_relationships')
                .select('related_user_id')
                .eq('user_id', userId)
                .eq('status', 'accepted')
                .eq('relationship_type', 'friend');

            if (!friends || friends.length === 0) return [];

            const friendIds = friends.map(f => f.related_user_id);

            // 2. Get event relations for these friends
            const { data: relations, error } = await supabase
                .from('user_event_relationships')
                .select(`
          event_id,
          relationship_type,
          user_id,
          users:user_id (
            name,
            avatar_url
          ),
          events:event_id (
            title,
            artist_name,
            venue_name,
            event_date,
            images
          )
        `)
                .in('user_id', friendIds)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            return (relations || []).map((rel: any) => ({
                id: rel.event_id,
                title: rel.events?.title || '',
                artist_name: rel.events?.artist_name || '',
                venue_name: rel.events?.venue_name || '',
                event_date: rel.events?.event_date || '',
                image_url: rel.events?.images?.[0]?.url || undefined,
                friend_id: rel.user_id,
                friend_name: rel.users?.name || 'Someone',
                friend_avatar: rel.users?.avatar_url || undefined,
                action_type: rel.relationship_type === 'attending' ? 'going' : 'interested',
            }));
        } catch (error) {
            console.error('Error fetching network events:', error);
            return [];
        }
    }

    /**
     * Get trending events based on overall platform engagement
     */
    static async getTrendingEvents(): Promise<TrendingEvent[]> {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*, user_event_relationships(count)')
                .order('event_date', { ascending: true })
                .gte('event_date', new Date().toISOString())
                .limit(10);

            if (error) throw error;

            return (data || []).map((event: any) => ({
                id: event.id,
                title: event.title,
                artist_name: event.artist_name,
                venue_name: event.venue_name,
                event_date: event.event_date,
                image_url: event.images?.[0]?.url || undefined,
                trending_score: (event.user_event_relationships?.[0]?.count || 0) * 10,
                interest_count: (event.user_event_relationships?.[0]?.count || 0),
            }));
        } catch (error) {
            console.error('Error fetching trending events:', error);
            return [];
        }
    }

    /**
     * Friend suggestions rail — same pool + ranking as web HomeFeed (via @synth/shared).
     */
    static async getFriendSuggestionsForRail(userId: string, maxCards = 5): Promise<FriendSuggestion[]> {
        try {
            const pool = await getSimilarUsersToFriend(supabase, userId, 20);
            return rankFriendSuggestionsForRail(pool, maxCards) as FriendSuggestion[];
        } catch (error) {
            console.error('Error loading friend suggestions for rail:', error);
            return [];
        }
    }
}
