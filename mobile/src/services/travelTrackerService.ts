import { supabase } from '../integrations/supabase/client';

export interface TravelReviewPin {
    id: string;
    event_id: string | null;
    venue_id: string | null;
    rating: number | null;
    review_text: string | null;
    created_at: string;
    event_date: string;
    venue_name: string | null;
    latitude: number;
    longitude: number;
    venue_city: string | null;
    venue_state: string | null;
}

/** One map dot — all shows in the same city/metro area, so nearby venues don't render as overlapping pins. */
export interface TravelCityGroup {
    key: string;
    city: string | null;
    state: string | null;
    latitude: number;
    longitude: number;
    shows: TravelReviewPin[];
}

export class TravelTrackerService {
    static async getReviewsWithCoordinates(userId: string): Promise<TravelReviewPin[]> {
        const { data: reviewsData, error } = await supabase
            .from('reviews')
            .select(
                `
          id,
          event_id,
          venue_id,
          rating,
          review_text,
          created_at,
          "Event_date",
          venues:venue_id (
            id,
            name,
            latitude,
            longitude,
            city,
            state
          )
        `
            )
            .eq('user_id', userId)
            .eq('is_draft', false)
            .not('venue_id', 'is', null)
            .order('"Event_date"', { ascending: false });

        if (error) {
            console.error('[TravelTrackerService]', error.message);
            return [];
        }

        const out: TravelReviewPin[] = [];
        for (const review of reviewsData || []) {
            const r = review as Record<string, unknown>;
            const venueRaw = r.venues;
            const venue = Array.isArray(venueRaw) ? venueRaw[0] : venueRaw;
            if (!venue || typeof venue !== 'object') continue;
            const v = venue as Record<string, unknown>;
            const latitude = v.latitude != null ? Number(v.latitude) : NaN;
            const longitude = v.longitude != null ? Number(v.longitude) : NaN;
            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                continue;
            }
            out.push({
                id: String(r.id),
                event_id: r.event_id != null ? String(r.event_id) : null,
                venue_id: r.venue_id != null ? String(r.venue_id) : null,
                rating: r.rating != null ? Number(r.rating) : null,
                review_text: r.review_text != null ? String(r.review_text) : null,
                created_at: String(r.created_at),
                event_date: String(
                    (r.Event_date as string | undefined) ??
                        (r.event_date as string | undefined) ??
                        r.created_at
                ),
                venue_name: v.name != null ? String(v.name) : null,
                latitude,
                longitude,
                venue_city: v.city != null ? String(v.city) : null,
                venue_state: v.state != null ? String(v.state) : null,
            });
        }
        return out;
    }

    /** Groups pins by city (falling back to state, then venue) and centroids their coordinates. */
    static groupByCity(pins: TravelReviewPin[]): TravelCityGroup[] {
        const groups = new Map<string, TravelCityGroup>();
        for (const pin of pins) {
            const city = pin.venue_city?.trim() || null;
            const state = pin.venue_state?.trim() || null;
            const key = city
                ? `${city.toLowerCase()}|${(state || '').toLowerCase()}`
                : state
                  ? `state:${state.toLowerCase()}`
                  : `venue:${(pin.venue_name || pin.id).toLowerCase()}`;

            const existing = groups.get(key);
            if (existing) {
                const n = existing.shows.length;
                existing.latitude = (existing.latitude * n + pin.latitude) / (n + 1);
                existing.longitude = (existing.longitude * n + pin.longitude) / (n + 1);
                existing.shows.push(pin);
            } else {
                groups.set(key, {
                    key,
                    city,
                    state,
                    latitude: pin.latitude,
                    longitude: pin.longitude,
                    shows: [pin],
                });
            }
        }
        return Array.from(groups.values());
    }
}
