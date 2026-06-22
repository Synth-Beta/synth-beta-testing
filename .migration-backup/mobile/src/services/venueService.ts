import { supabase } from '../integrations/supabase/client';

export interface Venue {
    id: string;
    name: string;
    image_url?: string;
    city?: string;
    distance?: number;
}

export class VenueService {
    static async getPopularVenues(limit = 20): Promise<Venue[]> {
        const { data, error } = await supabase
            .from('venues')
            .select('id, name, image_url, city')
            .order('popularity', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching popular venues:', error);
            return [];
        }

        return data || [];
    }

    static async getNearbyVenues(lat: number, lng: number, radiusInMiles = 25, limit = 20): Promise<Venue[]> {
        // Basic bounding box search for simplicity in this migration
        const latDelta = radiusInMiles / 69;
        const lngDelta = radiusInMiles / (69 * Math.cos(lat * Math.PI / 180));

        const { data, error } = await supabase
            .from('venues')
            .select('id, name, image_url, city, latitude, longitude')
            .gte('latitude', lat - latDelta)
            .lte('latitude', lat + latDelta)
            .gte('longitude', lng - lngDelta)
            .lte('longitude', lng + lngDelta)
            .limit(limit);

        if (error) {
            console.error('Error fetching nearby venues:', error);
            return [];
        }

        return (data || []).map(v => ({
            id: v.id,
            name: v.name,
            image_url: v.image_url,
            city: v.city,
            // Optional: calculate real distance here if needed
        }));
    }
}
