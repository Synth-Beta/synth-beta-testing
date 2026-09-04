import { supabase } from '../integrations/supabase/client';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../utils/eventImages';

export interface MyReviewListItem {
    id: string;
    rating: number | null;
    review_text: string | null;
    was_there?: boolean | null;
    created_at: string;
    event_id: string | null;
    rank_order: number | null;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
}

export interface InterestedEventItem {
    event_id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    venue_city?: string;
    ticket_url?: string;
    /** 'interested' | 'going' | 'maybe' — drives the Going label on the card. */
    relationship_type: string;
}

/** Web-aligned unreviewed queue: attendance-marker reviews + eligible drafts. */
export type ProfileUnreviewedItem =
    | {
          kind: 'attendance_marker';
          reviewId: string;
          event_id: string;
          title: string;
          artist_name: string;
          venue_name: string;
          event_date: string;
          image_url?: string;
          sortDate: string;
      }
    | {
          kind: 'draft';
          reviewId: string;
          event_id: string | null;
          title: string;
          artist_name: string;
          venue_name: string;
          event_date: string;
          image_url?: string;
          sortDate: string;
      };

function includeInPublishedReviewsList(r: {
    was_there?: boolean | null;
    review_text?: string | null;
    rating?: number | null;
    artist_performance_rating?: number | null;
}): boolean {
    if (r.was_there === true) return true;
    if (r.review_text && r.review_text !== 'ATTENDANCE_ONLY') return true;
    // Include reviews that have any rating even if no text (e.g. quick-flow star-only)
    if (typeof r.rating === 'number' && r.rating > 0) return true;
    if (typeof r.artist_performance_rating === 'number' && r.artist_performance_rating > 0) return true;
    return false;
}

/** Result of loading published reviews for profile (reviews query errors surface here; events batch is best-effort). */
export type GetMyReviewsResult = {
    items: MyReviewListItem[];
    /** Set when the primary `reviews` query fails (same UX signal as web throwing on that step). */
    error: string | null;
};

function mapFilteredReviewToListItem(
    item: Record<string, unknown>,
    eventsMap: Record<string, Record<string, unknown>>,
    artistsMap: Record<string, { name?: string | null; image_url?: string | null }>,
    venuesMap: Record<string, { name?: string | null }>,
    userCreatedArtistsMap: Record<string, { name?: string | null }>,
    userCreatedVenuesMap: Record<string, { name?: string | null }>
): MyReviewListItem {
    const eventId = item.event_id as string | null | undefined;
    const artistId = item.artist_id as string | null | undefined;
    const venueId = item.venue_id as string | null | undefined;
    const ucaId = item.user_created_artist_id as string | null | undefined;
    const ucvId = item.user_created_venue_id as string | null | undefined;

    const eventData = eventId ? eventsMap[eventId] ?? null : null;

    const resolvedArtistName = artistId
        ? (artistsMap[artistId]?.name ?? null)
        : ucaId
          ? (userCreatedArtistsMap[ucaId]?.name ?? null)
          : null;
    const resolvedVenueName = venueId
        ? (venuesMap[venueId]?.name ?? null)
        : ucvId
          ? (userCreatedVenuesMap[ucvId]?.name ?? null)
          : null;

    let ev = eventData;
    if (!ev && (artistId || ucaId || venueId || ucvId)) {
        ev = {
            title: null,
            artist_name: resolvedArtistName,
            venue_name: resolvedVenueName,
            event_date: null,
            images: undefined,
        };
    }
    if (ev && (!ev.artist_name || !ev.venue_name)) {
        ev = { ...ev };
        if (!ev.artist_name) ev.artist_name = resolvedArtistName ?? '';
        if (!ev.venue_name) ev.venue_name = resolvedVenueName ?? '';
    }

    const artistNameStr = String(ev?.artist_name ?? resolvedArtistName ?? '');
    const venueNameStr = String(ev?.venue_name ?? resolvedVenueName ?? '');
    const title =
        (ev?.title as string | null | undefined) ||
        artistNameStr ||
        (resolvedArtistName && resolvedVenueName
            ? `${resolvedArtistName} at ${resolvedVenueName}`
            : resolvedArtistName || resolvedVenueName || 'Event');

    const images = ev?.images as Array<{ url?: string }> | undefined;
    const artistImageUrl =
        artistId ? artistsMap[artistId]?.image_url ?? null :
        ucaId ? null : null;

    return {
        id: String(item.id),
        rating: (item.rating as number | null) ?? null,
        review_text: (item.review_text as string | null) ?? null,
        was_there: (item.was_there as boolean | null | undefined) ?? null,
        created_at: String(item.created_at ?? ''),
        event_id: (eventId as string | null) ?? null,
        rank_order: (item.rank_order as number | null | undefined) ?? null,
        title,
        artist_name: artistNameStr,
        venue_name: venueNameStr,
        event_date: String(ev?.event_date ?? ''),
        // Prefer artist image (matches web), fall back to event image; filter JamBase/broken placeholders
        image_url: resolveFeedImageUri(artistImageUrl || images?.[0]?.url) ?? undefined,
    };
}

export class MyEventsService {
    /**
     * Loads published reviews like web `getUserReviewHistory`: `reviews` first, then batch `events`
     * (no PostgREST embed on the critical path).
     *
     * Visibility (own reviews, public reviews, or a direct friend's private
     * reviews) is enforced by the reviews_select RLS policy - no is_public
     * filter here, so a friend's private review isn't hidden even though RLS
     * already deems it visible to this viewer.
     */
    static async getMyReviews(userId: string): Promise<GetMyReviewsResult> {
        // `user_created_venue_id` only exists once
        // supabase/user-created-venues-2026-09-04/02_*.sql has been applied;
        // `user_created_artist_id` is already live. Ask for both, fall back to
        // the artist side alone on 42703 — falling all the way back to neither
        // would silently drop user-created artist names from every card.
        const FULL_SELECT =
            'id, rating, review_text, was_there, created_at, event_id, rank_order, artist_id, venue_id, user_created_artist_id, user_created_venue_id';
        const BASE_SELECT =
            'id, rating, review_text, was_there, created_at, event_id, rank_order, artist_id, venue_id, user_created_artist_id';

        let reviewsData: any[] | null = null;
        let reviewsError: any = null;
        {
            const q = supabase
                .from('reviews')
                .select(FULL_SELECT)
                .eq('user_id', userId)
                .or('is_draft.eq.false,is_draft.is.null');
            ({ data: reviewsData, error: reviewsError } = await q.order('created_at', { ascending: false }));
        }

        let hasUserCreatedVenueCol = true;
        if (reviewsError) {
            // Retry without user_created_venue_id in case the migration hasn't run here.
            const fallbackQuery = supabase
                .from('reviews')
                .select(BASE_SELECT)
                .eq('user_id', userId)
                .or('is_draft.eq.false,is_draft.is.null');
            const fallback = await fallbackQuery.order('created_at', { ascending: false });
            if (fallback.error) {
                const code = fallback.error.code ?? 'unknown';
                const msg = fallback.error.message ?? String(fallback.error);
                console.warn('[myEvents] getMyReviews reviews query failed', { code, message: msg, details: fallback.error });
                return { items: [], error: `${code}: ${msg}` };
            }
            reviewsData = fallback.data;
            reviewsError = null;
            hasUserCreatedVenueCol = false;
            if (__DEV__) {
                console.debug('[myEvents] getMyReviews: fell back — reviews.user_created_venue_id not in this DB yet');
            }
        }

        const raw = reviewsData || [];
        const filtered = raw.filter((r: Record<string, unknown>) => includeInPublishedReviewsList(r));
        if (__DEV__) {
            console.debug('[myEvents] getMyReviews counts', {
                userId,
                rawCount: raw.length,
                filteredCount: filtered.length,
            });
        }

        const eventIds = [...new Set(filtered.map((r: any) => r.event_id).filter(Boolean))] as string[];
        const reviewArtistIds = [...new Set(filtered.map((r: any) => r.artist_id).filter(Boolean))] as string[];
        const reviewVenueIds = [...new Set(filtered.map((r: any) => r.venue_id).filter(Boolean))] as string[];
        const reviewUserCreatedArtistIds = [
            ...new Set(filtered.map((r: any) => r.user_created_artist_id).filter(Boolean)),
        ] as string[];
        const reviewUserCreatedVenueIds = hasUserCreatedVenueCol
            ? ([...new Set(filtered.map((r: any) => r.user_created_venue_id).filter(Boolean))] as string[])
            : [];

        let eventsMap: Record<string, Record<string, unknown>> = {};
        const artistsMap: Record<string, { name?: string | null; image_url?: string | null }> = {};
        const venuesMap: Record<string, { name?: string | null }> = {};

        if (eventIds.length > 0) {
            // events table is normalized — no artist_name/venue_name columns; join from artists/venues
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('id, title, artist_id, venue_id, event_date, images')
                .in('id', eventIds);

            if (eventsError) {
                const code = eventsError.code ?? 'unknown';
                const msg = eventsError.message ?? String(eventsError);
                console.warn('[myEvents] getMyReviews events batch failed (continuing with review fallbacks)', {
                    code,
                    message: msg,
                    details: eventsError,
                });
            } else if (eventsData?.length) {
                const eventArtistIds = [...new Set(eventsData.map((e: any) => e.artist_id).filter(Boolean))] as string[];
                const eventVenueIds = [...new Set(eventsData.map((e: any) => e.venue_id).filter(Boolean))] as string[];
                const allArtistIds = [...new Set([...eventArtistIds, ...reviewArtistIds])];
                const allVenueIds = [...new Set([...eventVenueIds, ...reviewVenueIds])];

                const eventArtistsMap: Record<string, { name?: string | null; image_url?: string | null }> = {};
                if (allArtistIds.length > 0) {
                    const { data: artistsData, error: aErr } = await supabase
                        .from('artists')
                        .select('id, name, image_url')
                        .in('id', allArtistIds);
                    if (aErr) {
                        console.warn('[myEvents] getMyReviews artists batch', {
                            code: aErr.code,
                            message: aErr.message,
                        });
                    }
                    for (const a of artistsData || []) {
                        eventArtistsMap[(a as any).id] = { name: (a as any).name, image_url: (a as any).image_url ?? null };
                    }
                }

                const eventVenuesMap: Record<string, { name?: string | null }> = {};
                if (allVenueIds.length > 0) {
                    const { data: venuesData, error: vErr } = await supabase
                        .from('venues')
                        .select('id, name')
                        .in('id', allVenueIds);
                    if (vErr) {
                        console.warn('[myEvents] getMyReviews venues batch', {
                            code: vErr.code,
                            message: vErr.message,
                        });
                    }
                    for (const v of venuesData || []) {
                        eventVenuesMap[(v as { id: string }).id] = { name: (v as { name: string }).name };
                    }
                }

                eventsMap = (eventsData as Record<string, unknown>[]).reduce(
                    (acc: Record<string, Record<string, unknown>>, event: Record<string, unknown>) => {
                        const id = String(event.id);
                        const aid = event.artist_id as string | undefined;
                        const vid = event.venue_id as string | undefined;
                        acc[id] = {
                            ...event,
                            artist_name: (aid && eventArtistsMap[aid]?.name) || null,
                            venue_name: (vid && eventVenuesMap[vid]?.name) || null,
                        };
                        return acc;
                    },
                    {}
                );

                Object.assign(artistsMap, eventArtistsMap);
                Object.assign(venuesMap, eventVenuesMap);
            }
        }

        if (reviewArtistIds.length > 0) {
            const { data: artistsData, error: aErr } = await supabase
                .from('artists')
                .select('id, name, image_url')
                .in('id', reviewArtistIds);
            if (aErr) {
                console.warn('[myEvents] getMyReviews review artists batch', {
                    code: aErr.code,
                    message: aErr.message,
                });
            }
            for (const a of artistsData || []) {
                artistsMap[(a as any).id] = { name: (a as any).name, image_url: (a as any).image_url ?? null };
            }
        }

        if (reviewVenueIds.length > 0) {
            const { data: venuesData, error: vErr } = await supabase
                .from('venues')
                .select('id, name')
                .in('id', reviewVenueIds);
            if (vErr) {
                console.warn('[myEvents] getMyReviews review venues batch', {
                    code: vErr.code,
                    message: vErr.message,
                });
            }
            for (const v of venuesData || []) {
                venuesMap[(v as { id: string }).id] = { name: (v as { name: string }).name };
            }
        }

        const userCreatedArtistsMap: Record<string, { name?: string | null }> = {};
        if (reviewUserCreatedArtistIds.length > 0) {
            const { data: ucaData, error: ucaErr } = await supabase
                .from('user_created_artists')
                .select('id, name')
                .in('id', reviewUserCreatedArtistIds);
            if (ucaErr) {
                console.warn('[myEvents] getMyReviews user_created_artists', {
                    code: ucaErr.code,
                    message: ucaErr.message,
                });
            }
            for (const row of ucaData || []) {
                userCreatedArtistsMap[(row as { id: string }).id] = { name: (row as { name: string }).name };
            }
        }

        const userCreatedVenuesMap: Record<string, { name?: string | null }> = {};
        if (reviewUserCreatedVenueIds.length > 0) {
            const { data: ucvData, error: ucvErr } = await supabase
                .from('user_created_venues')
                .select('id, name')
                .in('id', reviewUserCreatedVenueIds);
            if (ucvErr) {
                console.warn('[myEvents] getMyReviews user_created_venues', {
                    code: ucvErr.code,
                    message: ucvErr.message,
                });
            }
            for (const row of ucvData || []) {
                userCreatedVenuesMap[(row as { id: string }).id] = { name: (row as { name: string }).name };
            }
        }

        const items = filtered.map((r: Record<string, unknown>) =>
            mapFilteredReviewToListItem(r, eventsMap, artistsMap, venuesMap, userCreatedArtistsMap, userCreatedVenuesMap)
        );

        return { items, error: null };
    }

    static async countDraftReviews(userId: string): Promise<number> {
        const { count, error } = await supabase
            .from('reviews')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_draft', true);
        if (error) {
            console.warn('[myEvents] countDraftReviews', error.message);
            return 0;
        }
        return count ?? 0;
    }

    static async getInterestedEvents(userId: string): Promise<InterestedEventItem[]> {
        // Step 1: get event IDs (same two-step approach as web to avoid PostgREST join issues)
        const { data: relRows, error: relError } = await supabase
            .from('user_event_relationships')
            .select('event_id, relationship_type')
            .eq('user_id', userId)
            .in('relationship_type', ['interested', 'going', 'maybe'])
            .order('created_at', { ascending: false })
            .limit(120);

        if (relError) {
            console.warn('[myEvents] getInterestedEvents relationships', relError);
            return [];
        }

        const eventIds = (relRows || []).map((r: any) => r.event_id).filter(Boolean) as string[];
        if (eventIds.length === 0) return [];

        // Which rung of the ladder each event sits on, for the Going label.
        const typeByEventId = new Map<string, string>(
            (relRows || []).map((r: any) => [r.event_id as string, r.relationship_type as string])
        );

        // Exclude events moved to “My Events” via attendance (matches web ProfileView).
        const { data: attendanceRows } = await supabase
            .from('reviews')
            .select('event_id')
            .eq('user_id', userId)
            .eq('was_there', true);
        const attendedIds = new Set(
            ((attendanceRows || []) as { event_id?: string | null }[])
                .map(r => r.event_id)
                .filter(Boolean) as string[]
        );

        const idsToFetch = eventIds.filter(id => !attendedIds.has(id));
        if (idsToFetch.length === 0) return [];

        // Step 2: fetch event rows (chunk .in() — large lists can fail on PostgREST / some clients).
        const EVENTS_IN_CHUNK = 80;
        const eventsData: Record<string, unknown>[] = [];
        for (let i = 0; i < idsToFetch.length; i += EVENTS_IN_CHUNK) {
            const slice = idsToFetch.slice(i, i + EVENTS_IN_CHUNK);
            const { data: chunk, error: eventsError } = await supabase
                .from('events')
                .select('id, title, event_date, images, artist_id, venue_id, venue_city, ticket_urls')
                .in('id', slice);
            if (eventsError) {
                console.warn('[myEvents] getInterestedEvents events', eventsError);
                continue;
            }
            eventsData.push(...((chunk || []) as Record<string, unknown>[]));
        }
        if (eventsData.length === 0) {
            return [];
        }

        // Step 3: resolve artist and venue names from normalized tables
        const allArtistIds = [...new Set((eventsData || []).map((e: any) => e.artist_id).filter(Boolean))] as string[];
        const allVenueIds = [...new Set((eventsData || []).map((e: any) => e.venue_id).filter(Boolean))] as string[];

        const [artistsResult, venuesResult] = await Promise.all([
            allArtistIds.length > 0
                ? supabase.from('artists').select('id, name, image_url').in('id', allArtistIds)
                : Promise.resolve({ data: [] as Array<{ id: string; name: string; image_url?: string | null }>, error: null }),
            allVenueIds.length > 0
                ? supabase.from('venues').select('id, name').in('id', allVenueIds)
                : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
        ]);

        const artistMap = new Map(
            (artistsResult.data || []).map((a: { id: string; name: string; image_url?: string | null }) => [
                a.id,
                { name: a.name, image_url: a.image_url ?? null },
            ])
        );
        const venueMap = new Map((venuesResult.data || []).map((v: any) => [v.id, v.name as string]));

        // Preserve order from step 1
        const eventsById = new Map((eventsData || []).map((e: any) => [e.id, e]));

        const results: InterestedEventItem[] = [];
        for (const eventId of eventIds) {
            if (attendedIds.has(eventId)) continue;
            const ev = eventsById.get(eventId);
            if (!ev) continue;
            const artistRow = ev.artist_id ? artistMap.get(ev.artist_id) : undefined;
            const artistName = artistRow?.name || '';
            const venueName = (ev.venue_id ? venueMap.get(ev.venue_id) : null) || '';
            const eventPayload = ev as Record<string, unknown>;
            const rawImage =
                artistRow?.image_url ||
                pickFeedImageUrlFromPayload(eventPayload) ||
                (eventPayload.images as Array<{ url?: string }> | undefined)?.[0]?.url;
            const imageUrl = resolveFeedImageUri(rawImage) ?? undefined;
            results.push({
                event_id: ev.id,
                title: ev.title || artistName || 'Event',
                artist_name: artistName,
                venue_name: venueName,
                event_date: ev.event_date || '',
                image_url: imageUrl,
                venue_city: ev.venue_city || undefined,
                ticket_url: (ev.ticket_urls as string[] | null)?.[0] || undefined,
                relationship_type: typeByEventId.get(ev.id) ?? 'interested',
            });
        }

        // Going first — it's the real commitment, so it leads the list. Array.sort is
        // stable, so everything else keeps the existing created_at-desc order. Done
        // here rather than per screen so the Interested screen and another user's
        // profile stay in sync.
        results.sort((a, b) => {
            const aGoing = a.relationship_type === 'going' ? 0 : 1;
            const bGoing = b.relationship_type === 'going' ? 0 : 1;
            return aGoing - bGoing;
        });

        return results;
    }

    /**
     * Matches web ProfileView “Unreviewed”: `review_text === 'ATTENDANCE_ONLY'` published rows
     * plus draft reviews without a completed review on the same `event_id`.
     */
    static async getProfileUnreviewedQueue(userId: string): Promise<ProfileUnreviewedItem[]> {
        const { data: completedRows } = await supabase
            .from('reviews')
            .select('event_id')
            .eq('user_id', userId)
            .eq('is_draft', false)
            .not('review_text', 'is', null)
            .neq('review_text', 'ATTENDANCE_ONLY');

        const completedEventIds = new Set(
            (completedRows || [])
                .map((r: { event_id: string | null }) => r.event_id)
                .filter(Boolean) as string[]
        );

        // events table has no artist_name/venue_name — only select normalized columns
        const [{ data: markers, error: mErr }, { data: draftRows, error: dErr }] = await Promise.all([
            supabase
                .from('reviews')
                .select(
                    `
          id,
          event_id,
          updated_at,
          events (
            id,
            title,
            artist_id,
            venue_id,
            event_date,
            images
          )
        `
                )
                .eq('user_id', userId)
                .eq('is_draft', false)
                .eq('review_text', 'ATTENDANCE_ONLY')
                .order('updated_at', { ascending: false })
                .limit(500),
            supabase
                .from('reviews')
                .select(
                    `
          id,
          event_id,
          updated_at,
          created_at,
          events (
            id,
            title,
            artist_id,
            venue_id,
            event_date,
            images
          )
        `
                )
                .eq('user_id', userId)
                .eq('is_draft', true)
                .order('updated_at', { ascending: false })
                .limit(500),
        ]);

        if (mErr) console.warn('[myEvents] attendance markers', mErr.message);
        if (dErr) console.warn('[myEvents] drafts', dErr.message);

        // Resolve artist/venue names for all events in one batch
        const allEventArtistIds = [...new Set([
            ...(markers || []).map((r: any) => r.events?.artist_id).filter(Boolean),
            ...(draftRows || []).map((r: any) => r.events?.artist_id).filter(Boolean),
        ])] as string[];
        const allEventVenueIds = [...new Set([
            ...(markers || []).map((r: any) => r.events?.venue_id).filter(Boolean),
            ...(draftRows || []).map((r: any) => r.events?.venue_id).filter(Boolean),
        ])] as string[];

        const [unreviewedArtistsResult, unreviewedVenuesResult] = await Promise.all([
            allEventArtistIds.length > 0
                ? supabase.from('artists').select('id, name').in('id', allEventArtistIds)
                : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
            allEventVenueIds.length > 0
                ? supabase.from('venues').select('id, name').in('id', allEventVenueIds)
                : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
        ]);
        const unreviewedArtistMap = new Map((unreviewedArtistsResult.data || []).map(a => [a.id, a.name as string]));
        const unreviewedVenueMap = new Map((unreviewedVenuesResult.data || []).map(v => [v.id, v.name as string]));

        const items: ProfileUnreviewedItem[] = [];

        for (const r of markers || []) {
            const ev = (r as any).events;
            const eventId = (r as any).event_id as string | null;
            if (!eventId || !ev?.id) continue;
            const artistName = ev.artist_id ? (unreviewedArtistMap.get(ev.artist_id) || '') : '';
            const venueName = ev.venue_id ? (unreviewedVenueMap.get(ev.venue_id) || '') : '';
            const sortDate = String(ev.event_date || (r as any).updated_at || '');
            items.push({
                kind: 'attendance_marker',
                reviewId: (r as any).id,
                event_id: eventId,
                title: ev.title || artistName || 'Event',
                artist_name: artistName,
                venue_name: venueName,
                event_date: ev.event_date || '',
                image_url: ev.images?.[0]?.url,
                sortDate,
            });
        }

        for (const r of draftRows || []) {
            const ev = (r as any).events;
            const eventId = (r as any).event_id as string | null;
            if (eventId && completedEventIds.has(eventId)) continue;

            const artistName = ev?.artist_id ? (unreviewedArtistMap.get(ev.artist_id) || '') : '';
            const venueName = ev?.venue_id ? (unreviewedVenueMap.get(ev.venue_id) || '') : '';
            const sortDate = String(
                ev?.event_date || (r as any).updated_at || (r as any).created_at || ''
            );
            const title = ev?.title || artistName || 'Continue review';
            items.push({
                kind: 'draft',
                reviewId: (r as any).id,
                event_id: eventId,
                title,
                artist_name: artistName,
                venue_name: venueName,
                event_date: ev?.event_date || '',
                image_url: ev?.images?.[0]?.url,
                sortDate,
            });
        }

        items.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));
        return items;
    }
}
