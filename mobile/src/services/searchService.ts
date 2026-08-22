import { supabase } from '../integrations/supabase/client';
import {
    eventRawMatchesLocalYmd,
    localYmdToStartOfDayIso,
    eventDateToLocalYmd,
} from '../utils/localYmd';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../utils/eventTicketUrl';
import { sanitizeOrFilterTerm } from '../utils/postgrestSanitize';

export interface SearchResult {
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

/** Hard row cap PostgREST applies to every response on this project. */
const POSTGREST_MAX_ROWS = 1000;

/** Ceiling on cursor pages per calendar window, so a dense month cannot fan out. */
const MAX_CALENDAR_PAGES = 6;

function mapCalendarRpcRowToSearchResult(event: Record<string, unknown>): SearchResult {
    const rawImg =
        pickFeedImageUrlFromPayload(event) ??
        (typeof event.event_media_url === 'string' ? event.event_media_url : undefined);
    return {
        id: String(event.id),
        title: String(event.title ?? ''),
        artist_name: String(event.artist_name ?? ''),
        venue_name: String(event.venue_name ?? ''),
        venue_city: event.venue_city != null ? String(event.venue_city) : undefined,
        event_date: String(event.event_date ?? ''),
        image_url: resolveFeedImageUri(rawImg) ?? undefined,
        artist_id: event.artist_id != null ? String(event.artist_id) : undefined,
        venue_id: event.venue_id != null ? String(event.venue_id) : undefined,
        ticket_url: getCompliantEventLinkFromPayload(event) ?? undefined,
    };
}

export type SearchScope = 'events' | 'artists' | 'venues' | 'users';

export interface ArtistSearchRow {
    id: string;
    name: string;
    image_url?: string;
}

export interface VenueSearchRow {
    id: string;
    name: string;
    city?: string | null;
}

export interface UserSearchRow {
    user_id: string;
    name: string | null;
    username: string | null;
    avatar_url?: string | null;
}

export class SearchService {
    static async searchEvents(keyword: string): Promise<SearchResult[]> {
        try {
            const term = sanitizeOrFilterTerm(keyword || '');
            if (!term) return [];

            const { data, error } = await supabase
                .from('events')
                .select('*')
                .or(`artist_name.ilike.%${term}%,title.ilike.%${term}%,venue_name.ilike.%${term}%`)
                .order('event_date', { ascending: false })
                .limit(40);

            if (error) throw error;

            return (data || []).map(event => {
                const rawImg =
                    pickFeedImageUrlFromPayload(event) ?? event.images?.[0]?.url ?? undefined;
                return {
                    id: event.id,
                    title: event.title,
                    artist_name: event.artist_name,
                    venue_name: event.venue_name,
                    venue_city: event.venue_city ?? undefined,
                    event_date: event.event_date,
                    image_url: resolveFeedImageUri(rawImg) ?? undefined,
                    artist_id: event.artist_id != null ? String(event.artist_id) : undefined,
                    venue_id: event.venue_id != null ? String(event.venue_id) : undefined,
                    ticket_url: getCompliantEventLinkFromPayload(event) ?? undefined,
                };
            });
        } catch (error) {
            console.error('Error searching events:', error);
            return [];
        }
    }

    /**
     * Bulk-load calendar events from `minDate` (default: start of today local) and group
     * by local yyyy-mm-dd. Matches web MapCalendarTourSection + get_calendar_events usage.
     *
     * `until` makes this cover a whole window rather than "the next 1000 events".
     * get_calendar_events has no p_max_date and PostgREST caps responses at 1000 rows, so
     * one call only reaches as far as 1000 events happen to stretch — about four weeks for
     * a dense market, which left later months rendering empty. When `until` is given we
     * page forward on event_date until the window is covered or the events run out.
     */
    static async loadDiscoverCalendarEvents(opts?: {
        latitude?: number | null;
        longitude?: number | null;
        radiusMiles?: number;
        limit?: number;
        /** ISO start of the window. Defaults to start of today, local. */
        minDate?: string;
        /** ISO end of the window. Without it, a single page is fetched. */
        until?: string;
    }): Promise<{ byDate: Record<string, SearchResult[]>; error: string | null }> {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const p_min_date = opts?.minDate ?? now.toISOString();
        const hasCoords =
            opts?.latitude != null &&
            opts?.longitude != null &&
            Number.isFinite(opts.latitude) &&
            Number.isFinite(opts.longitude);
        const radius = opts?.radiusMiles ?? 30;
        // PostgREST truncates every response on this project at 1000 rows, so asking the
        // RPC for more is work the client can never see. It is not free: with p_limit
        // 10000 the no-location branch sorts 10k joined rows, spills to disk, and blows
        // the statement timeout (measured: 3.1s timeout at 10000 vs 0.39s at 1000).
        const limit = Math.min(opts?.limit ?? POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS);

        const byDate: Record<string, SearchResult[]> = {};
        const seenIds = new Set<string>();
        const collect = (rows: Array<Record<string, unknown>>) => {
            for (const row of rows) {
                const ymd = eventDateToLocalYmd(row.event_date);
                if (!ymd) continue;
                const sr = mapCalendarRpcRowToSearchResult(row);
                // Pages overlap on the cursor date, so the same event can arrive twice.
                if (seenIds.has(sr.id)) continue;
                seenIds.add(sr.id);
                if (!byDate[ymd]) byDate[ymd] = [];
                byDate[ymd].push(sr);
            }
        };

        try {
            let cursor = p_min_date;
            let rpcError: { message?: string } | null = null;

            for (let page = 0; page < MAX_CALENDAR_PAGES; page++) {
                // Pass all 8 params to ensure the correct overload is resolved by PostgREST.
                const { data, error } = await supabase.rpc('get_calendar_events', {
                    p_latitude: hasCoords ? opts!.latitude! : null,
                    p_longitude: hasCoords ? opts!.longitude! : null,
                    p_radius_miles: hasCoords ? radius : null,
                    p_min_date: cursor,
                    p_genres: null,
                    p_limit: limit,
                    p_umbrella_slug: null,
                    p_max_depth: 5,
                });

                if (error) {
                    rpcError = error;
                    break;
                }

                const rows = (data || []) as Array<Record<string, unknown>>;
                collect(rows);

                // A short page means the events ran out, so there is nothing left to page to.
                // Paging is also pointless without a location filter: nationwide there are
                // 120k+ upcoming events, and a measured 6-page walk bought 5 days of a month
                // for 6 round trips. With coords a single page reaches weeks past the window.
                if (!opts?.until || !hasCoords || rows.length < limit) break;

                const lastDate = rows[rows.length - 1]?.event_date;
                if (typeof lastDate !== 'string') break;
                // Compare instants, not strings — the RPC returns `+00:00` offsets while
                // toISOString() produces `Z`, so lexical compare is wrong at the boundary.
                const lastMs = Date.parse(lastDate);
                if (!Number.isFinite(lastMs)) break;
                // Either the window is covered, or a single date filled the whole cap and
                // advancing the cursor would spin without progress. Stop on both.
                if (lastMs >= Date.parse(opts.until) || lastMs <= Date.parse(cursor)) break;
                cursor = lastDate;
            }

            if (!rpcError) {
                return { byDate, error: null };
            }

            if (__DEV__) {
                console.warn('[SearchService] loadDiscoverCalendarEvents RPC error', rpcError);
            }

            // Pages already in hand are real data — report them alongside the error rather
            // than throwing them away and re-fetching the same range a different way.
            if (seenIds.size > 0) {
                return { byDate, error: rpcError.message ?? 'Calendar load failed' };
            }

            // Fallback: direct table query when the RPC fails (most often a 57014
            // statement timeout on a wide/cold scan). `events` is normalized — it has
            // artist_id/venue_id but no artist_name/venue_name — so the names come from
            // embedded artists/venues rows, not from columns on `events` itself.
            let fallbackQuery = supabase
                .from('events')
                .select(
                    'id, title, artist_id, venue_id, event_date, venue_city, event_media_url, images, ticket_urls, latitude, longitude, artists:artist_id ( name ), venues:venue_id ( name )'
                )
                .gte('event_date', p_min_date);

            if (opts?.until) {
                fallbackQuery = fallbackQuery.lte('event_date', opts.until);
            }

            // Keep the fallback location-scoped too, otherwise a NYC user silently gets
            // a nationwide list. Degrees-per-mile box is approximate but bounds the scan.
            if (hasCoords) {
                const latDelta = radius / 69;
                const lngDelta =
                    radius / (69 * Math.max(0.01, Math.cos((opts!.latitude! * Math.PI) / 180)));
                fallbackQuery = fallbackQuery
                    .gte('latitude', opts!.latitude! - latDelta)
                    .lte('latitude', opts!.latitude! + latDelta)
                    .gte('longitude', opts!.longitude! - lngDelta)
                    .lte('longitude', opts!.longitude! + lngDelta);
            }

            const { data: fbData, error: fbError } = await fallbackQuery
                .order('event_date', { ascending: true })
                .limit(limit);

            if (fbError) {
                // Surface the RPC failure — it is the actual cause. The fallback error is
                // downstream noise and reporting it sends debugging in the wrong direction.
                return { byDate: {}, error: rpcError.message ?? fbError.message ?? 'Calendar load failed' };
            }

            const fbRows = (fbData || []).map((row: any) => ({
                ...row,
                artist_name: row.artists?.name ?? '',
                venue_name: row.venues?.name ?? '',
            })) as Array<Record<string, unknown>>;

            collect(fbRows);
            return { byDate, error: null };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Calendar load failed';
            if (__DEV__) {
                console.warn('[SearchService] loadDiscoverCalendarEvents', e);
            }
            return { byDate: {}, error: msg };
        }
    }

    static async getEventsByDateRange(
        start: string,
        end: string,
        opts?: { latitude?: number | null; longitude?: number | null; radiusMiles?: number; limit?: number }
    ): Promise<SearchResult[]> {
        try {
            const startDay = String(start).slice(0, 10);
            const endDay = String(end).slice(0, 10);
            const sameDay = startDay.length === 10 && startDay === endDay;

            const hasCoords =
                opts?.latitude != null &&
                opts?.longitude != null &&
                Number.isFinite(opts.latitude) &&
                Number.isFinite(opts.longitude);
            const p_min_date = localYmdToStartOfDayIso(startDay);

            const { data, error } = await supabase.rpc('get_calendar_events', {
                p_latitude: hasCoords ? opts!.latitude! : null,
                p_longitude: hasCoords ? opts!.longitude! : null,
                p_radius_miles: hasCoords ? (opts?.radiusMiles ?? 30) : null,
                p_min_date,
                p_genres: null,
                p_limit: opts?.limit ?? 200,
            });

            if (error) {
                if (__DEV__) {
                    console.warn('[SearchService] getEventsByDateRange RPC error', error);
                }
                throw error;
            }

            const rows = (data || []) as Array<Record<string, unknown>>;

            const filtered = sameDay
                ? rows.filter(ev => eventRawMatchesLocalYmd(ev?.event_date, startDay))
                : rows;

            return filtered.map(row => mapCalendarRpcRowToSearchResult(row));
        } catch (error) {
            if (__DEV__) {
                console.warn('[SearchService] getEventsByDateRange', error);
            }
            return [];
        }
    }

    static async searchArtists(keyword: string, limit = 20): Promise<ArtistSearchRow[]> {
        if (!keyword.trim()) return [];
        try {
            const q = keyword.trim();
            const { data, error } = await supabase
                .from('artists')
                .select('id, name, image_url')
                .ilike('name', `%${q}%`)
                .limit(limit);
            if (error) throw error;
            return (data || []) as ArtistSearchRow[];
        } catch (e) {
            console.error('searchArtists', e);
            return [];
        }
    }

    static async searchVenues(keyword: string, limit = 20): Promise<VenueSearchRow[]> {
        if (!keyword.trim()) return [];
        try {
            const q = keyword.trim();
            const { data, error } = await supabase
                .from('venues')
                .select('id, name, city')
                .ilike('name', `%${q}%`)
                .limit(limit);
            if (error) throw error;
            return (data || []) as VenueSearchRow[];
        } catch (e) {
            console.error('searchVenues', e);
            return [];
        }
    }

    static async searchUsers(keyword: string, limit = 20): Promise<UserSearchRow[]> {
        const q = sanitizeOrFilterTerm(keyword || '');
        if (!q) return [];
        try {
            const { data, error } = await supabase
                .from('users')
                .select('user_id, name, username, avatar_url')
                .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
                .limit(limit);
            if (error) throw error;
            return (data || []) as UserSearchRow[];
        } catch (e) {
            console.error('searchUsers', e);
            return [];
        }
    }
}
