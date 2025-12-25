/**
 * Venue Service
 * 
 * Handles venue data normalization, searching, and management
 * across all tables in the Supabase database.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export interface Venue {
  id: string;
  name: string;
  identifier: string;
  url?: string;
  image_url?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  date_published?: string;
  date_modified?: string;
  created_at: string;
  updated_at: string;
}

export interface VenueWithStats extends Venue {
  total_events: number;
  upcoming_events: number;
  last_event_date?: string;
  first_event_date?: string;
}

export interface VenueSearchResult {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  similarity: number;
}

export interface VenueWithEvents extends Venue {
  events_count: number;
  upcoming_events_count: number;
}

export class VenueService {
  /**
   * Search for venues using fuzzy matching
   */
  static async searchVenues(
    searchTerm: string, 
    limit: number = 10
  ): Promise<VenueSearchResult[]> {
    try {
      const { data, error } = await supabase.rpc('search_venues', {
        search_term: searchTerm,
        limit_count: limit
      });

      if (error) {
        console.error('Error searching venues:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception searching venues:', error);
      return [];
    }
  }

  /**
   * Get all venues with their event statistics
   */
  static async getVenuesWithStats(): Promise<VenueWithStats[]> {
    try {
      const { data, error } = await supabase
        .from('venues_with_stats')
        .select('*')
        .order('upcoming_events', { ascending: false });

      if (error) {
        console.error('Error fetching venues with stats:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception fetching venues with stats:', error);
      return [];
    }
  }

  /**
   * Get a specific venue with its event count
   */
  static async getVenueWithEvents(venueId: string): Promise<VenueWithEvents | null> {
    try {
      // Resolve JamBase ID if venueId is a UUID
      let jambaseVenueId = venueId;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venueId);
      
      if (isUUID) {
        const { data: venue } = await supabase
          .from('venues_with_external_ids')
          .select('jambase_venue_id')
          .eq('id', venueId)
          .maybeSingle();
        
        if (venue?.jambase_venue_id) {
          jambaseVenueId = venue.jambase_venue_id;
        }
      }
      
      const { data, error } = await supabase.rpc('get_venue_with_events', {
        venue_jambase_id: jambaseVenueId
      });

      if (error) {
        console.error('Error fetching venue with events:', error);
        return null;
      }

      return data?.[0] || null;
    } catch (error) {
      console.error('Exception fetching venue with events:', error);
      return null;
    }
  }

  /**
   * Find or create a venue
   */
  static async findOrCreateVenue(
    venueName: string,
    venueAddress?: string,
    venueCity?: string,
    venueState?: string,
    venueZip?: string,
    latitude?: number,
    longitude?: number
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('find_or_create_venue', {
        venue_name: venueName,
        venue_address: venueAddress,
        venue_city: venueCity,
        venue_state: venueState,
        venue_zip: venueZip,
        latitude: latitude,
        longitude: longitude
      });

      if (error) {
        console.error('Error finding or creating venue:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception finding or creating venue:', error);
      return null;
    }
  }

  /**
   * Get venue by ID
   */
  static async getVenueById(venueId: string): Promise<Venue | null> {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', venueId)
        .single();

      if (error) {
        console.error('Error fetching venue by ID:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception fetching venue by ID:', error);
      return null;
    }
  }

  /**
   * Get venues by city and state
   */
  static async getVenuesByLocation(
    city?: string, 
    state?: string
  ): Promise<Venue[]> {
    try {
      let query = supabase
        .from('venues')
        .select('*');

      if (city) {
        query = query.ilike('city', `%${city}%`);
      }

      if (state) {
        query = query.ilike('state', `%${state}%`);
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('Error fetching venues by location:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception fetching venues by location:', error);
      return [];
    }
  }

  /**
   * Get venues within a radius of coordinates
   */
  static async getVenuesWithinRadius(
    latitude: number,
    longitude: number,
    radiusKm: number = 50
  ): Promise<Venue[]> {
    try {
      // Use the radius search function if available
      const { data, error } = await supabase.rpc('search_venues_within_radius', {
        lat: latitude,
        lng: longitude,
        radius_km: radiusKm
      });

      if (error) {
        console.error('Error fetching venues within radius:', error);
        // Fallback to basic query
        return this.getVenuesWithStats();
      }

      return data || [];
    } catch (error) {
      console.error('Exception fetching venues within radius:', error);
      return [];
    }
  }

  /**
   * Normalize venue name (client-side helper)
   */
  static normalizeVenueName(venueName: string): string {
    return venueName
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/^\s+|\s+$/g, ''); // Trim start and end
  }

  /**
   * Generate venue identifier from name
   */
  static generateVenueIdentifier(venueName: string): string {
    return venueName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Check if two venue names are similar (for duplicate detection)
   */
  static areVenueNamesSimilar(name1: string, name2: string): boolean {
    const normalized1 = this.normalizeVenueName(name1).toLowerCase();
    const normalized2 = this.normalizeVenueName(name2).toLowerCase();
    
    // Exact match
    if (normalized1 === normalized2) return true;
    
    // One contains the other
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
    
    // Remove special characters and compare
    const clean1 = normalized1.replace(/[^a-z0-9]/g, '');
    const clean2 = normalized2.replace(/[^a-z0-9]/g, '');
    
    if (clean1 === clean2) return true;
    
    // Check for common abbreviations
    const abbreviations = {
      'theatre': 'theater',
      'centre': 'center',
      'st': 'street',
      'ave': 'avenue',
      'blvd': 'boulevard',
      'rd': 'road'
    };
    
    let modified1 = clean1;
    let modified2 = clean2;
    
    Object.entries(abbreviations).forEach(([abbr, full]) => {
      modified1 = modified1.replace(abbr, full);
      modified2 = modified2.replace(abbr, full);
    });
    
    return modified1 === modified2;
  }

  /**
   * Get venue display name with location
   */
  static getVenueDisplayName(venue: Venue): string {
    let displayName = venue.name;
    
    if (venue.city && venue.state) {
      displayName += ` (${venue.city}, ${venue.state})`;
    } else if (venue.city) {
      displayName += ` (${venue.city})`;
    } else if (venue.state) {
      displayName += ` (${venue.state})`;
    }
    
    return displayName;
  }

  /**
   * Get venue coordinates for mapping
   */
  static getVenueCoordinates(venue: Venue): { lat: number; lng: number } | null {
    if (venue.latitude && venue.longitude) {
      return {
        lat: Number(venue.latitude),
        lng: Number(venue.longitude)
      };
    }
    return null;
  }

  /**
   * Format venue address
   */
  static formatVenueAddress(venue: Venue): string {
    const parts = [];
    
    if (venue.address) parts.push(venue.address);
    if (venue.city) parts.push(venue.city);
    if (venue.state) parts.push(venue.state);
    if (venue.zip) parts.push(venue.zip);
    
    return parts.join(', ');
  }
}

export default VenueService;
