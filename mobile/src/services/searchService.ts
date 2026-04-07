import { supabase } from '../integrations/supabase/client';
import {
    todayLocalYmd,
    eventRawMatchesLocalYmd,
    localYmdToStartOfDayIso,
    eventDateToLocalYmd,
} from '../utils/localYmd';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../utils/eventTicketUrl';

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
            if (!keyword) return [];
            const today = todayLocalYmd();

            const { data, error } = await supabase
                .from('events')
                .select('*')
                .or(`artist_name.ilike.%${keyword}%,title.ilike.%${keyword}%,venue_name.ilike.%${keyword}%`)
                .gte('event_date', today)
                .order('event_date', { ascending: true })
                .limit(20);

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
     * Bulk-load upcoming calendar events (from start of today local) and group by local yyyy-mm-dd.
     * Matches web MapCalendarTourSection + get_calendar_events usage.
     */
    static async loadDiscoverCalendarEvents(opts?: {
        latitude?: number | null;
        longitude?: number | null;
        radiusMiles?: number;
        limit?: number;
    }): Promise<{ byDate: Record<string, SearchResult[]>; error: string | null }> {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const p_min_date = now.toISOString();
        const hasCoords =
            opts?.latitude != null &&
            opts?.longitude != null &&
            Number.isFinite(opts.latitude) &&
            Number.isFinite(opts.longitude);
        const radius = opts?.radiusMiles ?? 30;
        const limit = opts?.limit ?? 10000;

        const groupByDate = (rows: Array<Record<string, unknown>>): Record<string, SearchResult[]> => {
            const byDate: Record<string, SearchResult[]> = {};
            for (const row of rows) {
                const ymd = eventDateToLocalYmd(row.event_date);
                if (!ymd) continue;
                const sr = mapCalendarRpcRowToSearchResult(row);
                if (!byDate[ymd]) byDate[ymd] = [];
                byDate[ymd].push(sr);
            }
            return byDate;
        };

        try {
            // Pass all 8 params to ensure the correct overload is resolved by PostgREST.
            const { data, error } = await supabase.rpc('get_calendar_events', {
                p_latitude: hasCoords ? opts!.latitude! : null,
                p_longitude: hasCoords ? opts!.longitude! : null,
                p_radius_miles: hasCoords ? radius : null,
                p_min_date,
                p_genres: null,
                p_limit: limit,
                p_umbrella_slug: null,
                p_max_depth: 5,
            });

            if (!error) {
                return { byDate: groupByDate((data || []) as Array<Record<string, unknown>>), error: null };
            }

            if (__DEV__) {
                console.warn('[SearchService] loadDiscoverCalendarEvents RPC error, falling back to direct query', error);
            }

            // Fallback: direct table query when RPC fails (e.g. permission or schema issue).
            // Only columns that are guaranteed to exist — no `images` or optional extras.
            const fallbackQuery = supabase
                .from('events')
                .select('id, title, artist_name, artist_id, venue_name, venue_id, event_date, venue_city, event_media_url, latitude, longitude')
                .gte('event_date', p_min_date)
                .order('event_date', { ascending: true })
                .limit(limit);

            const { data: fbData, error: fbError } = await fallbackQuery;
            if (fbError) {
                return { byDate: {}, error: fbError.message ?? 'Calendar load failed' };
            }
            return { byDate: groupByDate((fbData || []) as Array<Record<string, unknown>>), error: null };
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
        if (!keyword.trim()) return [];
        try {
            const q = keyword.trim();
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
