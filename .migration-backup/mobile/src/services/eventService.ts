import { buildShareLandingUrl } from '@synth/shared';
import { Platform, Share } from 'react-native';
import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';
import { getCompliantEventLinkFromPayload } from '../utils/eventTicketUrl';
import { resolveFeedImageUri } from '../utils/eventImages';

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
        const url = buildShareLandingUrl(getExpoSiteUrl(), 'event', routeId);
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
        const url = buildShareLandingUrl(getExpoSiteUrl(), 'review', reviewId);
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
                    console.debug('[EventService] getEventById: unable to resolve query id', { raw: eventId });
                }
                return null;
            }

            // Use select('*') to avoid column-not-found errors from explicit column lists.
            // PostgREST never errors on '*'; it just returns whatever columns exist.
            let { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('id', queryId)
                .maybeSingle();

            if (error || !data) {
                console.warn('[EventService] getEventById: event not found', {
                    raw: eventId, queryId,
                    error: error?.message, code: error?.code,
                    hasData: !!data,
                });
                return null;
            }

            const row = data as Record<string, unknown>;

            // Fetch artist and venue separately to avoid join schema issues.
            const artistId = (data.artist_id ?? data.artist_uuid) as string | null | undefined;
            const venueId = (data.venue_id ?? data.venue_uuid) as string | null | undefined;

            type ArtistRow = { name?: string; image_url?: string | null };
            type VenueRow = {
                name?: string;
                city?: string;
                address?: string;
                state?: string | null;
                zip?: string | null;
                latitude?: number | null;
                longitude?: number | null;
            };

            let artistRow: ArtistRow | null = null;
            let venueRow: VenueRow | null = null;

            const [artistResult, venueResult] = await Promise.all([
                artistId
                    ? supabase.from('artists').select('name, image_url').eq('id', artistId).maybeSingle()
                    : Promise.resolve({ data: null }),
                venueId
                    ? supabase.from('venues').select('name, city, address, state, zip, latitude, longitude').eq('id', venueId).maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);

            if (artistResult.data) artistRow = artistResult.data as ArtistRow;
            if (venueResult.data) venueRow = venueResult.data as VenueRow;

            // Fallback: if direct UUID lookup failed, try resolving via external_entity_ids.
            // This handles events where artist_id/venue_id is a JamBase external ID, not a Synth UUID.
            const [artistFallback, venueFallback] = await Promise.all([
                (!artistRow && artistId)
                    ? supabase.from('external_entity_ids').select('entity_uuid').eq('entity_type', 'artist').eq('external_id', artistId).maybeSingle()
                    : Promise.resolve({ data: null }),
                (!venueRow && venueId)
                    ? supabase.from('external_entity_ids').select('entity_uuid').eq('entity_type', 'venue').eq('external_id', venueId).maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);
            if (!artistRow && artistFallback.data?.entity_uuid) {
                const r = await supabase.from('artists').select('name, image_url').eq('id', artistFallback.data.entity_uuid).maybeSingle();
                if (r.data) artistRow = r.data as ArtistRow;
            }
            if (!venueRow && venueFallback.data?.entity_uuid) {
                const r = await supabase.from('venues').select('name, city, address, state, zip, latitude, longitude').eq('id', venueFallback.data.entity_uuid).maybeSingle();
                if (r.data) venueRow = r.data as VenueRow;
            }

            const genresRaw = row.genres;
            const genres =
                Array.isArray(genresRaw) && genresRaw.every(g => typeof g === 'string')
                    ? (genresRaw as string[])
                    : null;

            return {
                id: data.id,
                artist_id: artistId ?? null,
                venue_id: venueId ?? null,
                title: data.title,
                artist_name: artistRow?.name || (data.artist_name as string) || '',
                venue_name: venueRow?.name || (data.venue_name as string) || '',
                event_date: data.event_date,
                description: data.description,
                image_url:
                    resolveFeedImageUri(
                        (data.images as { url?: string }[] | undefined)?.[0]?.url ||
                            artistRow?.image_url ||
                            undefined
                    ) ?? undefined,
                venue_city: venueRow?.city || (data.venue_city as string | undefined),
                venue_address: venueRow?.address || (data.venue_address as string | undefined),
                venue_state:
                    (typeof row.venue_state === 'string' ? row.venue_state : null) ??
                    venueRow?.state ??
                    null,
                venue_zip: (() => {
                    const ez = typeof row.venue_zip === 'string' ? row.venue_zip.trim() : '';
                    const vz = typeof venueRow?.zip === 'string' ? venueRow.zip.trim() : '';
                    return ez || vz || null;
                })(),
                ticket_url: getCompliantEventLinkFromPayload(row) ?? undefined,
                latitude:
                    typeof data.latitude === 'number'
                        ? data.latitude
                        : typeof venueRow?.latitude === 'number'
                          ? venueRow.latitude
                          : null,
                longitude:
                    typeof data.longitude === 'number'
                        ? data.longitude
                        : typeof venueRow?.longitude === 'number'
                          ? venueRow.longitude
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
    static async toggleInteraction(
        userId: string,
        eventId: string,
        type: 'going' | 'interested'
    ): Promise<'added' | 'removed' | 'noop' | null> {
        try {
            const canonicalEventId = await this.resolveEventQueryId(eventId);
            if (!canonicalEventId) return null;

            const { data: existing } = await supabase
                .from('user_event_relationships')
                .select('relationship_type')
                .eq('user_id', userId)
                .eq('event_id', canonicalEventId)
                .maybeSingle();

            if (type === 'interested') {
                // Only un-heart when the current type is specifically 'interested'.
                // 'going'/'maybe' are stronger RSVPs — preserve them and signal no-op.
                if (existing?.relationship_type === 'interested') {
                    const { error } = await supabase
                        .from('user_event_relationships')
                        .delete()
                        .eq('user_id', userId)
                        .eq('event_id', canonicalEventId);
                    return error ? null : 'removed';
                }
                if (existing?.relationship_type) {
                    return 'noop';
                }
                const { error } = await supabase.from('user_event_relationships').upsert(
                    {
                        user_id: userId,
                        event_id: canonicalEventId,
                        relationship_type: 'interested',
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id,event_id' }
                );
                return error ? null : 'added';
            }

            // `going`: same-type removes; otherwise upsert.
            if (existing && existing.relationship_type === type) {
                const { error } = await supabase
                    .from('user_event_relationships')
                    .delete()
                    .eq('user_id', userId)
                    .eq('event_id', canonicalEventId);
                return error ? null : 'removed';
            }

            const { error } = await supabase.from('user_event_relationships').upsert(
                {
                    user_id: userId,
                    event_id: canonicalEventId,
                    relationship_type: type,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,event_id' }
            );
            return error ? null : 'added';
        } catch (error) {
            console.error('Error toggling event interaction:', error);
            return null;
        }
    }
}
