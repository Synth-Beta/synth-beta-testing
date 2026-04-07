import { Platform, Share } from 'react-native';
import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';
import { getCompliantEventLinkFromPayload } from '../utils/eventTicketUrl';

export interface EventDetail {
    id: string;
    artist_id?: string | null;
    venue_id?: string | null;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    description?: string;
    image_url?: string;
    venue_city?: string;
    venue_address?: string;
    venue_state?: string | null;
    venue_zip?: string | null;
    ticket_url?: string;
    latitude?: number | null;
    longitude?: number | null;
    doors_time?: string | null;
    genres?: string[] | null;
    price_range?: string | null;
    price_min?: number | null;
    price_max?: number | null;
    price_currency?: string | null;
    tour_name?: string | null;
}

export interface FriendAttending {
    id: string;
    name: string;
    avatar_url?: string;
}

const EVENT_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Trim + safe decodeURIComponent for route / deep-link params. */
function normalizeEventRouteInput(raw: string): string {
    const t = raw?.trim() ?? '';
    if (!t) return '';
    try {
        return decodeURIComponent(t).trim();
    } catch {
        return t;
    }
}

function numOrNull(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

export class EventService {
    static async resolveCanonicalArtistId(raw: string): Promise<string | null> {
        const id = normalizeEventRouteInput(raw);
        if (!id) return null;
        if (EVENT_UUID_RE.test(id)) return id;
        try {
            const { data, error } = await supabase
                .from('external_entity_ids')
                .select('entity_uuid')
                .eq('entity_type', 'artist')
                .eq('external_id', id)
                .maybeSingle();
            if (error || !data?.entity_uuid) return null;
            if (__DEV__) {
                console.debug('[EventService] resolved artist id', { raw: id, canonical: data.entity_uuid });
            }
            return data.entity_uuid as string;
        } catch {
            return null;
        }
    }

    static async resolveCanonicalVenueId(raw: string): Promise<string | null> {
        const id = normalizeEventRouteInput(raw);
        if (!id) return null;
        if (EVENT_UUID_RE.test(id)) return id;
        try {
            const { data, error } = await supabase
                .from('external_entity_ids')
                .select('entity_uuid')
                .eq('entity_type', 'venue')
                .eq('external_id', id)
                .maybeSingle();
            if (error || !data?.entity_uuid) return null;
            if (__DEV__) {
                console.debug('[EventService] resolved venue id', { raw: id, canonical: data.entity_uuid });
            }
            return data.entity_uuid as string;
        } catch {
            return null;
        }
    }

    /**
     * Normalize route param to `events.id` (UUID). Non-UUID values may resolve via `external_entity_ids`.
     */
    static async resolveCanonicalEventId(raw: string): Promise<string | null> {
        const id = normalizeEventRouteInput(raw);
        if (!id) return null;
        if (EVENT_UUID_RE.test(id)) return id;
        try {
            const { data, error } = await supabase
                .from('external_entity_ids')
                .select('entity_uuid')
                .eq('entity_type', 'event')
                .eq('external_id', id)
                .maybeSingle();
            if (error || !data?.entity_uuid) return null;
            if (__DEV__) {
                console.debug('[EventService] resolved event id', { raw: id, canonical: data.entity_uuid });
            }
            return data.entity_uuid as string;
        } catch {
            return null;
        }
    }

    /**
     * Route-safe event id: canonical UUID when resolvable, else original.
     * Use this before navigating to `/event/[id]` to avoid “Event not found”.
     */
    static async toEventRouteId(raw: string): Promise<string> {
        const canonical = await this.resolveCanonicalEventId(raw);
        const normalized = normalizeEventRouteInput(raw);
        return canonical ?? (normalized || raw.trim());
    }

    /**
     * `events.id` to use in queries: mapped UUID from `external_entity_ids`, else bare UUID string.
     */
    static async resolveEventQueryId(raw: string): Promise<string | null> {
        const normalized = normalizeEventRouteInput(raw);
        if (!normalized) return null;
        const mapped = await this.resolveCanonicalEventId(normalized);
        if (mapped) return mapped;
        if (EVENT_UUID_RE.test(normalized)) return normalized;
        if (__DEV__) {
            console.warn('[EventService] resolveEventQueryId: unmapped non-UUID event id', {
                normalized,
            });
        }
        return null;
    }

    /**
     * Open native share sheet with a tappable web/event URL (canonical id when resolvable).
     */
    static async shareEventLink(
        eventId: string,
        meta: { headline: string; formattedDate: string }
    ): Promise<void> {
        const routeId = await this.toEventRouteId(eventId);
        const url = `${getExpoSiteUrl()}/event/${encodeURIComponent(routeId)}`;
        const message = `${meta.headline} — ${meta.formattedDate}\n\n${url}`;
        try {
            if (Platform.OS === 'ios') {
                await Share.share({ message, title: meta.headline, url });
            } else {
                await Share.share({ message, title: meta.headline });
            }
        } catch {
            /* user dismissed share sheet */
        }
    }

    /** Web share landing (matches `ShareService.getReviewUrl`). */
    static async shareReviewLink(
        reviewId: string,
        meta: { headline: string; snippet?: string }
    ): Promise<void> {
        const url = `${getExpoSiteUrl()}/share?review=${encodeURIComponent(reviewId)}`;
        const message = meta.snippet
            ? `${meta.headline}\n\n"${meta.snippet}"\n\n${url}`
            : `${meta.headline}\n\n${url}`;
        try {
            if (Platform.OS === 'ios') {
                await Share.share({ message, title: meta.headline, url });
            } else {
                await Share.share({ message, title: meta.headline });
            }
        } catch {
            /* user dismissed share sheet */
        }
    }

    /**
     * Get detailed event info
     */
    static async getEventById(eventId: string): Promise<EventDetail | null> {
        try {
            const queryId = await this.resolveEventQueryId(eventId);
            if (!queryId) {
                if (__DEV__) {
                    console.debug('[EventService] getEventById: unable to resolve query id', {
                        raw: eventId,
                    });
                }
                return null;
            }

            const { data, error } = await supabase
                .from('events')
                .select(`
          *,
          artists(name, image_url),
          venues(name, city, address, state, zip, latitude, longitude)
        `)
                .eq('id', queryId)
                .maybeSingle();

            if (error || !data) {
                if (__DEV__) {
                    console.debug('[EventService] getEventById: not found', {
                        raw: eventId,
                        queryId,
                        error: error?.message,
                    });
                }
                return null;
            }

            const row = data as Record<string, unknown> & {
                artists?: { name?: string; image_url?: string | null };
                venues?: {
                    name?: string;
                    city?: string;
                    address?: string;
                    state?: string | null;
                    zip?: string | null;
                    latitude?: number | null;
                    longitude?: number | null;
                };
            };
            const genresRaw = row.genres;
            const genres =
                Array.isArray(genresRaw) && genresRaw.every(g => typeof g === 'string')
                    ? (genresRaw as string[])
                    : null;

            return {
                id: data.id,
                artist_id: data.artist_id ?? data.artist_uuid ?? null,
                venue_id: data.venue_id ?? data.venue_uuid ?? null,
                title: data.title,
                artist_name: row.artists?.name || data.artist_name || '',
                venue_name: row.venues?.name || data.venue_name || '',
                event_date: data.event_date,
                description: data.description,
                image_url: data.images?.[0]?.url || row.artists?.image_url || undefined,
                venue_city: row.venues?.city || data.venue_city,
                venue_address: row.venues?.address || data.venue_address,
                venue_state:
                    (typeof row.venue_state === 'string' ? row.venue_state : null) ??
                    row.venues?.state ??
                    null,
                venue_zip: (() => {
                    const ez = typeof row.venue_zip === 'string' ? row.venue_zip.trim() : '';
                    const vz = typeof row.venues?.zip === 'string' ? row.venues.zip.trim() : '';
                    return ez || vz || null;
                })(),
                ticket_url: getCompliantEventLinkFromPayload(row) ?? undefined,
                latitude:
                    typeof data.latitude === 'number'
                        ? data.latitude
                        : typeof row.venues?.latitude === 'number'
                          ? row.venues.latitude
                          : null,
                longitude:
                    typeof data.longitude === 'number'
                        ? data.longitude
                        : typeof row.venues?.longitude === 'number'
                          ? row.venues.longitude
                          : null,
                doors_time: typeof row.doors_time === 'string' ? row.doors_time : null,
                genres,
                price_range: typeof row.price_range === 'string' ? row.price_range : null,
                price_min: numOrNull(row.price_min) ?? numOrNull(row.ticket_price_min),
                price_max: numOrNull(row.price_max) ?? numOrNull(row.ticket_price_max),
                price_currency: typeof row.price_currency === 'string' ? row.price_currency : null,
                tour_name: typeof row.tour_name === 'string' ? row.tour_name : null,
            };
        } catch (error) {
            console.error('Error fetching event detail:', error);
            return null;
        }
    }

    /**
     * Get friends who are going to this event
     */
    static async getFriendsAttending(eventId: string, userId: string): Promise<FriendAttending[]> {
        try {
            const canonicalEventId = await this.resolveEventQueryId(eventId);
            if (!canonicalEventId) return [];

            // 1. Get friends
            const { data: friends } = await supabase
                .from('user_relationships')
                .select('related_user_id')
                .eq('user_id', userId)
                .eq('status', 'accepted')
                .eq('relationship_type', 'friend');

            if (!friends || friends.length === 0) return [];

            const friendIds = friends.map(f => f.related_user_id);

            // 2. Get subset of friends going to this event
            const { data: attending, error } = await supabase
                .from('user_event_relationships')
                .select(`
          user_id,
          users:user_id (
            name,
            avatar_url
          )
        `)
                .eq('event_id', canonicalEventId)
                .eq('relationship_type', 'going')
                .in('user_id', friendIds);

            if (error) throw error;

            return (attending || []).map((rel: any) => ({
                id: rel.user_id,
                name: rel.users?.name || 'Friend',
                avatar_url: rel.users?.avatar_url || undefined,
            }));
        } catch (error) {
            console.error('Error fetching friends attending:', error);
            return [];
        }
    }

    /**
     * Set user interaction (going/interested)
     */
    static async toggleInteraction(userId: string, eventId: string, type: 'going' | 'interested'): Promise<boolean> {
        try {
            const canonicalEventId = await this.resolveEventQueryId(eventId);
            if (!canonicalEventId) return false;

            // Check current
            const { data: existing } = await supabase
                .from('user_event_relationships')
                .select('*')
                .eq('user_id', userId)
                .eq('event_id', canonicalEventId)
                .maybeSingle();

            if (existing && existing.relationship_type === type) {
                // Remove if same
                const { error } = await supabase
                    .from('user_event_relationships')
                    .delete()
                    .eq('user_id', userId)
                    .eq('event_id', canonicalEventId);
                return !error;
            } else {
                // Upsert new
                const { error } = await supabase
                    .from('user_event_relationships')
                    .upsert(
                        {
                            user_id: userId,
                            event_id: canonicalEventId,
                            relationship_type: type,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'user_id,event_id' }
                    );
                return !error;
            }
        } catch (error) {
            console.error('Error toggling event interaction:', error);
            return false;
        }
    }
}
