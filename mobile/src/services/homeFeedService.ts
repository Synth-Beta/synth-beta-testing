import { getSimilarUsersToFriend, rankFriendSuggestionsForRail } from '@synth/shared';
import { supabase } from '../integrations/supabase/client';
import { ReviewEngagementService } from './reviewEngagementService';
import { todayLocalYmd } from '../utils/localYmd';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../utils/eventTicketUrl';

/** Single event row from personalized feed RPC (unified recommended / social / trending ordering). */
export interface UnifiedPersonalizedEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    venue_city?: string;
    event_date: string;
    image_url?: string;
    /** Short label for corner badge (e.g. RECOMMENDED) derived from RPC context */
    feedLabel?: string;
    artist_id?: string;
    venue_id?: string;
    interested_count?: number;
    user_is_interested?: boolean;
    ticket_url?: string;
}

export type ReviewThumbnailCrop = {
    xPct: number;
    yPct: number;
    zoom: number;
};

export interface NetworkReview {
    id: string;
    event_id?: string;
    artist_id?: string;
    venue_id?: string;
    author: {
        id: string;
        name: string;
        avatar_url?: string;
    };
    created_at: string;
    rating?: number;
    content?: string;
    photos?: string[];
    /** Cover photo index when `photos` has multiple entries */
    thumbnail_index?: number;
    thumbnail_crop?: ReviewThumbnailCrop | null;
    artist_image_url?: string;
    event_info?: {
        artist_name?: string;
        venue_name?: string;
        event_date?: string;
    };
    // Category ratings (0.5–5.0 each)
    artist_performance_rating?: number;
    production_rating?: number;
    venue_rating?: number;
    location_rating?: number;
    value_rating?: number;
    likes_count?: number;
    comments_count?: number;
    shares_count?: number;
    is_liked_by_user?: boolean;
    connection_degree: 1 | 2;
}

export interface NetworkEvent {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    venue_city?: string;
    event_date: string;
    image_url?: string;
    friend_id: string;
    friend_name: string;
    friend_avatar?: string;
    action_type: 'going' | 'interested' | 'reviewed';
    interested_count?: number;
    /** All friends interested/going — for the friends feed avatar row */
    friends_all?: { id: string; name: string; avatar_url?: string | null }[];
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
    private static getFeedLabelFromContext(context: any): UnifiedPersonalizedEvent['feedLabel'] {
        const labelFrom = (v: unknown): string | undefined =>
            typeof v === 'string' && v.trim().length ? v.trim().toLowerCase() : undefined;

        const source = labelFrom(context?.source) || labelFrom(context?.category) || labelFrom(context?.kind);
        const because = labelFrom(context?.because);
        const combined = [source, because].filter(Boolean).join(' ');

        if (combined.includes('trend')) return 'TRENDING';
        if (combined.includes('follow')) return 'FOLLOWING';
        if (combined.includes('friend') || combined.includes('network')) return 'FRIENDS';
        if (combined.includes('recommend') || combined.includes('suggest') || combined.includes('for you'))
            return 'RECOMMENDED';

        return undefined;
    }

    /** Map one v5 RPC row like web `PersonalizationEngineV5.rowToEvent` + feed image picker. */
    private static mapFeedV5RowToUnifiedEvent(row: any): UnifiedPersonalizedEvent {
        const p = row.payload || {};
        const ctx = row.context || {};
        const eventId = p.id ?? p.event_id ?? p.event_uuid ?? row.id;

        const rawImage = pickFeedImageUrlFromPayload(p);
        const image_url = resolveFeedImageUri(rawImage) ?? undefined;

        const titleRaw = p.title != null ? String(p.title).trim() : '';
        const artist_name = p.artist_name != null ? String(p.artist_name).trim() : '';
        const venueNameRaw = p.venue_name != null ? String(p.venue_name).trim() : '';
        const venueAddrRaw = p.venue_address != null ? String(p.venue_address).trim() : '';
        const venue_name = venueNameRaw || venueAddrRaw || '';

        const ticketUrl = getCompliantEventLinkFromPayload(p);

        const interestedRaw = ctx.total_interest_count;
        const interested_count =
            typeof interestedRaw === 'number' && Number.isFinite(interestedRaw) ? interestedRaw : 0;

        return {
            id: String(eventId ?? ''),
            title: titleRaw || 'Untitled Event',
            artist_name,
            venue_name,
            venue_city: p.venue_city != null && String(p.venue_city).trim() ? String(p.venue_city).trim() : undefined,
            event_date: p.event_date != null ? String(p.event_date) : '',
            image_url,
            feedLabel: this.getFeedLabelFromContext({
                source: row.section,
                because: p?.context?.because ?? ctx?.because,
                category: p?.context?.category ?? ctx?.category,
                kind: p?.context?.kind ?? ctx?.kind,
            }),
            artist_id: p.artist_id != null && String(p.artist_id) ? String(p.artist_id) : undefined,
            venue_id: p.venue_id != null && String(p.venue_id) ? String(p.venue_id) : undefined,
            interested_count,
            user_is_interested: Boolean(ctx.user_is_interested),
            ticket_url: ticketUrl ?? undefined,
        };
    }

    private static isCachedFeedWrapperMissing(error: any): boolean {
        return (
            error &&
            (error.code === '42883' ||
                error.code === 'PGRST116' ||
                error.code === 'PGRST204' ||
                /get_or_refresh_feed_v5_cached/.test(String(error.message || '')))
        );
    }

    private static async fetchPersonalizedFeedV5Rows(rpcPayload: {
        p_user_id: string;
        p_section: null;
        p_limit: number;
        p_offset: number;
        p_city_lat: number | null;
        p_city_lng: number | null;
        p_radius_miles: number;
        p_include_past: boolean;
        p_city_filter: null;
        p_state_filter: null;
        p_max_days_ahead: number;
    }): Promise<{ rows: any[]; error: any }> {
        let data: any;
        let error: any;

        try {
            const cachedResult = await supabase.rpc('get_or_refresh_feed_v5_cached', {
                ...rpcPayload,
                p_ttl_seconds: 600,
            });
            data = cachedResult.data;
            error = cachedResult.error;
        } catch (rpcErr: any) {
            error = rpcErr;
        }

        if (this.isCachedFeedWrapperMissing(error)) {
            const direct = await supabase.rpc('get_personalized_feed_v5', rpcPayload);
            data = direct.data;
            error = direct.error;
        }

        if (error) {
            return { rows: [], error };
        }
        return { rows: (data ?? []) as any[], error: null };
    }

    /**
     * Unified home events feed (matches web: cached v5 when available, same row mapping as web).
     */
    static async getUnifiedPersonalizedEvents(
        userId: string,
        limit = 50,
        cityLat: number | null = null,
        cityLng: number | null = null,
        radiusMiles = 50
    ): Promise<UnifiedPersonalizedEvent[]> {
        const debug = {
            userId,
            limit,
            cityLat,
            cityLng,
            radiusMiles,
        };
        try {
            const rpcPayload = {
                p_user_id: userId,
                p_section: null as null,
                p_limit: limit,
                p_offset: 0,
                p_city_lat: cityLat,
                p_city_lng: cityLng,
                p_radius_miles: radiusMiles,
                p_include_past: false,
                p_city_filter: null as null,
                p_state_filter: null as null,
                p_max_days_ahead: 180,
            };

            let { rows, error } = await this.fetchPersonalizedFeedV5Rows(rpcPayload);

            if (error) {
                console.warn('[homeFeed] personalized feed v5:', error.message ?? error);
                return await this.getFallbackUpcomingEvents(limit);
            }

            if (
                rows.length === 0 &&
                cityLat != null &&
                cityLng != null &&
                Number.isFinite(cityLat) &&
                Number.isFinite(cityLng)
            ) {
                const retry = await this.fetchPersonalizedFeedV5Rows({
                    ...rpcPayload,
                    p_city_lat: null,
                    p_city_lng: null,
                });
                if (!retry.error && retry.rows.length > 0) {
                    rows = retry.rows;
                }
            }

            const mapped: UnifiedPersonalizedEvent[] = rows
                .map((row: any) => this.mapFeedV5RowToUnifiedEvent(row))
                .filter(e => e.id.length > 0);

            if (mapped.length === 0) {
                const fallback = await this.getFallbackUpcomingEvents(limit);
                if (fallback.length === 0) {
                    console.warn('[homeFeed] v5 returned 0 rows and fallback also returned 0', debug);
                }
                return fallback;
            }

            return mapped;
        } catch (e) {
            console.error('[homeFeed] getUnifiedPersonalizedEvents', e);
            const fallback = await this.getFallbackUpcomingEvents(limit);
            if (fallback.length === 0) {
                console.warn('[homeFeed] exception and fallback returned 0', debug);
            }
            return fallback;
        }
    }

    private static async getFallbackUpcomingEvents(limit: number): Promise<UnifiedPersonalizedEvent[]> {
        // Match other mobile filters: local calendar day, not UTC from toISOString().
        const today = todayLocalYmd();
        const { data, error } = await supabase
            .from('events')
            .select('id, title, artist_name, artist_id, venue_id, venue_name, venue_city, event_date, images, ticket_urls')
            .gte('event_date', today)
            .order('event_date', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('[homeFeed] fallback events', error);
            return [];
        }

        return (data || []).map((event: any) => {
            const rawImg = pickFeedImageUrlFromPayload({
                images: event.images,
                poster_image_url: undefined,
                event_media_url: undefined,
                media_urls: undefined,
            });
            const image_url = resolveFeedImageUri(rawImg ?? event.images?.[0]?.url) ?? undefined;
            return {
                id: event.id,
                title: event.title?.trim() ? String(event.title) : 'Untitled Event',
                artist_name: event.artist_name || '',
                venue_name: event.venue_name || '',
                venue_city: event.venue_city || undefined,
                event_date: event.event_date || '',
                image_url,
                feedLabel: undefined,
                artist_id: event.artist_id != null ? String(event.artist_id) : undefined,
                venue_id: event.venue_id != null ? String(event.venue_id) : undefined,
                interested_count: 0,
                user_is_interested: false,
                ticket_url: getCompliantEventLinkFromPayload(event) ?? undefined,
            } satisfies UnifiedPersonalizedEvent;
        });
    }

    /**
     * Reviews from friends. Falls back to recent public reviews from all users
     * when the user has no friends yet (discovery mode for new/beta users).
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

            const friendIds = [userId, ...(friends ?? []).map(f => (f.user_id === userId ? f.related_user_id : f.user_id))];
            // When the user has no friends yet, show recent public reviews from all users
            // so the Reviews tab has content to discover (beta/new user experience).
            const hasFriends = (friends ?? []).length > 0;

            const selectFields = `
          id,
          user_id,
          event_id,
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
          events (
            id,
            title,
            event_date,
            artist_id,
            venue_id
          )
        `;

            let query = supabase
                .from('reviews')
                .select(selectFields)
                .eq('is_public', true)
                .eq('is_draft', false)
                .or('review_text.is.null,review_text.neq.ATTENDANCE_ONLY');

            // Filter by friend network when friends exist; otherwise show all public reviews
            if (hasFriends) {
                query = query.in('user_id', friendIds);
            }

            const { data: reviews, error: reviewsError } = await query
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

            const filtered = reviews.filter((review: any) => usersMap.has(review.user_id));
            const reviewIdsForLikes = filtered.map((r: any) => String(r.id));
            let likedIds = new Set<string>();
            try {
                likedIds = await ReviewEngagementService.getReviewIdsLikedByUser(userId, reviewIdsForLikes);
            } catch (engErr) {
                console.error('[homeFeed] getReviewIdsLikedByUser', engErr);
            }

            return filtered.map((review: any) => {
                const user = usersMap.get(review.user_id)!;
                const artistId = review.artist_id || review.events?.artist_id;
                const venueId = review.venue_id || review.events?.venue_id;
                const artistData = artistId ? artistsMap.get(artistId) : undefined;
                const venueName = venueId ? venuesMap.get(venueId) : undefined;

                return {
                    id: String(review.id),
                    event_id: review.event_id || review.events?.id,
                    artist_id: artistId != null ? String(artistId) : undefined,
                    venue_id: venueId != null ? String(venueId) : undefined,
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
                    artist_performance_rating: review.artist_performance_rating != null ? Number(review.artist_performance_rating) : undefined,
                    production_rating: review.production_rating != null ? Number(review.production_rating) : undefined,
                    venue_rating: review.venue_rating != null ? Number(review.venue_rating) : undefined,
                    location_rating: review.location_rating != null ? Number(review.location_rating) : undefined,
                    value_rating: review.value_rating != null ? Number(review.value_rating) : undefined,
                    likes_count: typeof review.likes_count === 'number' ? review.likes_count : 0,
                    comments_count: typeof review.comments_count === 'number' ? review.comments_count : 0,
                    shares_count: typeof review.shares_count === 'number' ? review.shares_count : 0,
                    is_liked_by_user: likedIds.has(String(review.id)),
                    connection_degree: 1 as const,
                };
            });
        } catch (error) {
            console.error('[homeFeed] getNetworkReviews', error);
            return [];
        }
    }

    /**
     * Get events where friends (1st degree) are interested or going.
     * Groups by event so each event appears once with all interested friends listed.
     */
    static async getNetworkEvents(userId: string, limit = 30): Promise<NetworkEvent[]> {
        try {
            // Bidirectional friends query (relationship can be stored either direction)
            const { data: rels } = await supabase
                .from('user_relationships')
                .select('user_id, related_user_id')
                .eq('status', 'accepted')
                .eq('relationship_type', 'friend')
                .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

            if (!rels || rels.length === 0) return [];

            const friendIds = rels.map(r => r.user_id === userId ? r.related_user_id : r.user_id);

            // Get all interested/going rows for those friends, including event + user info
            const { data: rows, error } = await supabase
                .from('user_event_relationships')
                .select(`
                    event_id,
                    relationship_type,
                    created_at,
                    user_id,
                    users:user_id ( user_id, name, avatar_url ),
                    events:event_id (
                        id, title, artist_name, venue_name, venue_city,
                        event_date, images, event_media_url, media_urls
                    )
                `)
                .in('user_id', friendIds)
                .in('relationship_type', ['interested', 'going', 'maybe'])
                .order('created_at', { ascending: false })
                .limit(limit * 8);

            if (error) throw error;
            if (!rows || rows.length === 0) return [];

            // Group by event_id
            const byEvent = new Map<string, { rows: any[]; ev: any }>();
            for (const row of rows as any[]) {
                if (!row.events) continue;
                const eid = row.event_id as string;
                if (!byEvent.has(eid)) byEvent.set(eid, { rows: [], ev: row.events });
                byEvent.get(eid)!.rows.push(row);
            }

            // Build one NetworkEvent per event, sorted by most-recently-actioned
            const results: NetworkEvent[] = [];
            byEvent.forEach(({ rows: eventRows, ev }) => {
                const primary = eventRows[0];
                const user = primary.users as any;

                // Pick best image
                let image_url: string | undefined;
                if (Array.isArray(ev.images) && ev.images.length > 0) {
                    const best = ev.images.find((img: any) => img?.url && (img?.ratio === '16_9' || img?.width > 1000))
                        || ev.images.find((img: any) => img?.url);
                    image_url = best?.url;
                }
                image_url = image_url || ev.event_media_url || (Array.isArray(ev.media_urls) ? ev.media_urls[0] : undefined);

                results.push({
                    id: ev.id,
                    title: ev.title || 'Event',
                    artist_name: ev.artist_name || '',
                    venue_name: ev.venue_name || '',
                    venue_city: ev.venue_city || undefined,
                    event_date: ev.event_date || '',
                    image_url,
                    friend_id: user?.user_id || primary.user_id,
                    friend_name: user?.name || 'Friend',
                    friend_avatar: user?.avatar_url || undefined,
                    action_type: primary.relationship_type === 'going' ? 'going' : 'interested',
                    interested_count: eventRows.length,
                    friends_all: eventRows.map((r: any) => ({
                        id: (r.users as any)?.user_id || r.user_id,
                        name: (r.users as any)?.name || 'Friend',
                        avatar_url: (r.users as any)?.avatar_url ?? null,
                    })),
                });
            });

            return results
                .sort((a, b) => (b.interested_count ?? 0) - (a.interested_count ?? 0))
                .slice(0, limit);
        } catch (err) {
            console.error('Error fetching network events:', err);
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
                .gte('event_date', todayLocalYmd())
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
