import { Platform, Share } from 'react-native';
import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';

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
    ticket_url?: string;
    latitude?: number | null;
    longitude?: number | null;
}

export interface FriendAttending {
    id: string;
    name: string;
    avatar_url?: string;
}

const EVENT_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class EventService {
    /**
     * Normalize route param to `events.id` (UUID). Non-UUID values may resolve via `external_entity_ids`.
     */
    static async resolveCanonicalEventId(raw: string): Promise<string | null> {
        const id = raw?.trim();
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
        return canonical ?? raw;
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
            const canonical = await this.resolveCanonicalEventId(eventId);
            if (!canonical) {
                if (__DEV__) {
                    console.debug('[EventService] getEventById: unable to resolve canonical id', { raw: eventId });
                }
                return null;
            }

            const { data, error } = await supabase
                .from('events')
                .select(`
          *,
          artists(name, images),
          venues(name, city, address, latitude, longitude)
        `)
                .eq('id', canonical)
                .maybeSingle();

            if (error || !data) {
                if (__DEV__) {
                    console.debug('[EventService] getEventById: not found', {
                        raw: eventId,
                        canonical,
                        error: error?.message,
                    });
                }
                return null;
            }

            return {
                id: data.id,
                artist_id: data.artist_id ?? data.artist_uuid ?? null,
                venue_id: data.venue_id ?? data.venue_uuid ?? null,
                title: data.title,
                artist_name: data.artists?.name || data.artist_name || '',
                venue_name: data.venues?.name || data.venue_name || '',
                event_date: data.event_date,
                description: data.description,
                image_url: data.images?.[0]?.url || data.artists?.images?.[0]?.url || undefined,
                venue_city: data.venues?.city || data.venue_city,
                venue_address: data.venues?.address || data.venue_address,
                ticket_url: data.ticket_urls?.[0],
                latitude:
                    typeof data.latitude === 'number'
                        ? data.latitude
                        : typeof data.venues?.latitude === 'number'
                          ? data.venues.latitude
                          : null,
                longitude:
                    typeof data.longitude === 'number'
                        ? data.longitude
                        : typeof data.venues?.longitude === 'number'
                          ? data.venues.longitude
                          : null,
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
                .eq('event_id', eventId)
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
            const canonical = await this.resolveCanonicalEventId(eventId);
            if (!canonical) return false;

            // Check current
            const { data: existing } = await supabase
                .from('user_event_relationships')
                .select('*')
                .eq('user_id', userId)
                .eq('event_id', canonical)
                .maybeSingle();

            if (existing && existing.relationship_type === type) {
                // Remove if same
                const { error } = await supabase
                    .from('user_event_relationships')
                    .delete()
                    .eq('user_id', userId)
                    .eq('event_id', canonical);
                return !error;
            } else {
                // Upsert new
                const { error } = await supabase
                    .from('user_event_relationships')
                    .upsert(
                        {
                            user_id: userId,
                            event_id: canonical,
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
