import { supabase } from '../integrations/supabase/client';
import { searchVenuesFuzzy, scoreNameMatch } from '@synth/shared';

export interface VenueSearchResult {
  id: string;
  name: string;
  identifier: string;
  image_url?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
  maximumAttendeeCapacity?: number;
  num_upcoming_events?: number;
  match_score: number;
  is_from_database: boolean;
}

export class UnifiedVenueSearchService {

  /**
   * Main search function - PROTECTED API USAGE:
   * 1. ALWAYS search local database FIRST
   * 2. Only call external API if useApi=true (explicit user search)
   * 3. Populate database with new results
   * 
   * @param query - Search query string
   * @param limit - Maximum results to return
   * @param useApi - If true, will call external APIs for new results. If false, only searches local DB.
   */
  static async searchVenues(query: string, limit: number = 20, useApi: boolean = false): Promise<VenueSearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      console.log(`🔍 Searching for venues: "${query}" (useApi: ${useApi})`);

      // STEP 1: ALWAYS search local database FIRST (no API call)
      let fuzzyResults: VenueSearchResult[] = [];
      try {
        fuzzyResults = await this.getFuzzyMatchedResults(query, limit);
        console.log(`🎯 Found ${fuzzyResults.length} venues from local database`);
      } catch (fuzzyError) {
        console.warn('⚠️  Could not get fuzzy results from database:', fuzzyError);
      }

      // STEP 2: Return database results immediately (for suggestions/autocomplete)
      if (!useApi) {
        // If no DB results, still return empty array (don't use fallback to avoid confusion)
        console.log(`✅ Returning ${fuzzyResults.length} results from local database (no API call)`);
        return fuzzyResults;
      }

      // STEP 3: Only if explicit search (useApi=true), fetch NEW results from API
      // Note: JamBase venues API doesn't exist, so we only search local DB for now
      // If API becomes available, it would go here
      console.log(`🌐 Explicit search triggered - searching for new venues in database...`);
      
      // Re-query database to ensure we have all results
      try {
        fuzzyResults = await this.getFuzzyMatchedResults(query, limit);
        console.log(`🎯 Final database results: ${fuzzyResults.length}`);
      } catch (finalError) {
        console.warn('⚠️  Could not get final results from database:', finalError);
      }

      // Return database results (no external API for venues currently)
      if (fuzzyResults.length > 0) {
        return fuzzyResults;
      }

      // If no results, return empty array (don't create manual entries automatically)
      console.log('📭 No venues found in database');
      return [];
    } catch (error) {
      console.error('❌ Error in venue search:', error);
      return [];
    }
  }

  /**
   * @deprecated Removed - JamBase API no longer used
   */
  private static async searchJamBaseAPI(query: string, limit: number): Promise<any[]> {
    return [];
  }

  /**
   * @deprecated Removed - API fallback no longer used
   */
  private static getFallbackVenues(query: string, limit: number): any[] {
    const fallbackVenues = [
      {
        id: 'madison-square-garden',
        name: 'Madison Square Garden',
        identifier: 'jambase:msg-1',
        image: 'https://picsum.photos/300/300?random=1',
        address: {
          streetAddress: '4 Pennsylvania Plaza',
          addressLocality: 'New York',
          addressRegion: 'NY',
          postalCode: '10001',
          addressCountry: 'US'
        },
        geo: {
          latitude: 40.7505,
          longitude: -73.9934
        },
        maximumAttendeeCapacity: 20789,
        num_upcoming_events: 25
      },
      {
        id: 'hollywood-bowl',
        name: 'Hollywood Bowl',
        identifier: 'jambase:hb-1',
        image: 'https://picsum.photos/300/300?random=2',
        address: {
          streetAddress: '2301 N Highland Ave',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA',
          postalCode: '90068',
          addressCountry: 'US'
        },
        geo: {
          latitude: 34.1122,
          longitude: -118.3390
        },
        maximumAttendeeCapacity: 17500,
        num_upcoming_events: 30
      },
      {
        id: 'the-factory',
        name: 'The Factory',
        identifier: 'jambase:factory-1',
        image: 'https://picsum.photos/300/300?random=3',
        address: {
          streetAddress: '123 Factory St',
          addressLocality: 'St. Louis',
          addressRegion: 'MO',
          postalCode: '63101',
          addressCountry: 'US'
        },
        geo: {
          latitude: 38.6270,
          longitude: -90.1994
        },
        maximumAttendeeCapacity: 2500,
        num_upcoming_events: 15
      },
      {
        id: 'red-rocks',
        name: 'Red Rocks Amphitheatre',
        identifier: 'jambase:rr-1',
        image: 'https://picsum.photos/300/300?random=4',
        address: {
          streetAddress: '18300 W Alameda Pkwy',
          addressLocality: 'Morrison',
          addressRegion: 'CO',
          postalCode: '80465',
          addressCountry: 'US'
        },
        geo: {
          latitude: 39.6654,
          longitude: -105.2056
        },
        maximumAttendeeCapacity: 9525,
        num_upcoming_events: 40
      },
      {
        id: 'brooklyn-bowl',
        name: 'Brooklyn Bowl',
        identifier: 'jambase:bb-1',
        image: 'https://picsum.photos/300/300?random=5',
        address: {
          streetAddress: '61 Wythe Ave',
          addressLocality: 'Brooklyn',
          addressRegion: 'NY',
          postalCode: '11249',
          addressCountry: 'US'
        },
        geo: {
          latitude: 40.7214,
          longitude: -73.9575
        },
        maximumAttendeeCapacity: 1200,
        num_upcoming_events: 15
      },
      {
        id: 'the-fillmore',
        name: 'The Fillmore',
        identifier: 'jambase:tf-1',
        image: 'https://picsum.photos/300/300?random=6',
        address: {
          streetAddress: '1805 Geary Blvd',
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          postalCode: '94115',
          addressCountry: 'US'
        },
        geo: {
          latitude: 37.7849,
          longitude: -122.4334
        },
        maximumAttendeeCapacity: 1250,
        num_upcoming_events: 20
      },
      {
        id: 'house-of-blues',
        name: 'House of Blues',
        identifier: 'jambase:hob-1',
        image: 'https://picsum.photos/300/300?random=7',
        address: {
          streetAddress: '225 Decatur St',
          addressLocality: 'New Orleans',
          addressRegion: 'LA',
          postalCode: '70130',
          addressCountry: 'US'
        },
        geo: {
          latitude: 29.9584,
          longitude: -90.0644
        },
        maximumAttendeeCapacity: 1000,
        num_upcoming_events: 18
      },
      {
        id: 'radio-city-music-hall',
        name: 'Radio City Music Hall',
        identifier: 'jambase:rcmh-1',
        image: 'https://picsum.photos/300/300?random=8',
        address: {
          streetAddress: '1260 6th Ave',
          addressLocality: 'New York',
          addressRegion: 'NY',
          postalCode: '10020',
          addressCountry: 'US'
        },
        geo: {
          latitude: 40.7600,
          longitude: -73.9798
        },
        maximumAttendeeCapacity: 6000,
        num_upcoming_events: 12
      },
      {
        id: 'the-greek-theatre',
        name: 'The Greek Theatre',
        identifier: 'jambase:tgt-1',
        image: 'https://picsum.photos/300/300?random=9',
        address: {
          streetAddress: '2700 N Vermont Ave',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA',
          postalCode: '90027',
          addressCountry: 'US'
        },
        geo: {
          latitude: 34.1183,
          longitude: -118.3003
        },
        maximumAttendeeCapacity: 5900,
        num_upcoming_events: 22
      }
    ];

    // Filter venues that match the query
    const matchingVenues = fallbackVenues.filter(venue => 
      venue.name.toLowerCase().includes(query.toLowerCase()) ||
      venue.address?.addressLocality?.toLowerCase().includes(query.toLowerCase()) ||
      venue.address?.addressRegion?.toLowerCase().includes(query.toLowerCase())
    );

    // If no matches found, return all venues (better than nothing)
    if (matchingVenues.length === 0) {
      return fallbackVenues.slice(0, limit);
    }

    return matchingVenues.slice(0, limit);
  }

  /**
   * @deprecated Removed - API population no longer used
   */
  private static async populateVenueProfiles(jamBaseVenues: any[]): Promise<any[]> {
    const populatedVenues: any[] = [];

    // Skip database population if no venues to process
    if (!jamBaseVenues || jamBaseVenues.length === 0) {
      return populatedVenues;
    }

    for (const jamBaseVenue of jamBaseVenues) {
      try {
        const venueId = jamBaseVenue.identifier?.split(':')[1] || jamBaseVenue.identifier;
        
        // Check if venue already exists (using helper view for normalized schema)
        const { data: existingVenueData, error: checkError } = await supabase
          .from('venues_with_external_ids' as any)
          .select('*')
          .eq('jambase_venue_id', venueId)
          .maybeSingle();

        if (existingVenueData && !checkError) {
          console.log(`♻️  Venue ${jamBaseVenue.name} already exists in database`);
          // Transform flat columns back to JSONB format for consistency
          populatedVenues.push({
            ...existingVenueData,
            address: {
              streetAddress: existingVenueData.address,
              addressLocality: existingVenueData.city,
              addressRegion: existingVenueData.state,
              postalCode: existingVenueData.zip,
              addressCountry: existingVenueData.country
            },
            geo: {
              latitude: existingVenueData.latitude,
              longitude: existingVenueData.longitude
            }
          } as any);
          continue;
        }

        // If table doesn't exist or other database error, skip database operations
        if (checkError && (checkError.code === 'PGRST116' || checkError.code === '42P01')) {
          console.warn(`⚠️  venues table doesn't exist yet. Skipping database operations for ${jamBaseVenue.name}`);
          // Still add the venue to results even if we can't store it
          populatedVenues.push({
            id: jamBaseVenue.id,
            jambase_venue_id: venueId,
            name: jamBaseVenue.name,
            address: jamBaseVenue.address,
            geo: jamBaseVenue.geo,
            maximum_attendee_capacity: jamBaseVenue.maximumAttendeeCapacity,
            num_upcoming_events: jamBaseVenue['x-numUpcomingEvents'] || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            identifier: jamBaseVenue.identifier
          } as any);
          continue;
        }

        // Handle other database errors
        if (checkError) {
          console.warn(`⚠️  Database error checking venue ${jamBaseVenue.name}:`, checkError);
          // Still add the venue to results even if we can't store it
          populatedVenues.push({
            id: jamBaseVenue.id,
            jambase_venue_id: venueId,
            name: jamBaseVenue.name,
            address: jamBaseVenue.address,
            geo: jamBaseVenue.geo,
            maximum_attendee_capacity: jamBaseVenue.maximumAttendeeCapacity,
            num_upcoming_events: jamBaseVenue['x-numUpcomingEvents'] || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            identifier: jamBaseVenue.identifier
          } as any);
          continue;
        }

        // Transform JSONB format to flat columns for the venues table (jambase_venue_id column removed)
        const venueData = {
          name: jamBaseVenue.name,
          identifier: jamBaseVenue.identifier,
          address: jamBaseVenue.address?.streetAddress || null,
          city: jamBaseVenue.address?.addressLocality || null,
          state: jamBaseVenue.address?.addressRegion || null,
          zip: jamBaseVenue.address?.postalCode || null,
          country: jamBaseVenue.address?.addressCountry || 'US',
          latitude: jamBaseVenue.geo?.latitude || null,
          longitude: jamBaseVenue.geo?.longitude || null,
          image_url: jamBaseVenue.image,
          url: jamBaseVenue.url,
          date_published: new Date().toISOString(),
          date_modified: new Date().toISOString()
        };
        
        // Check if venue already exists (using helper view for normalized schema)
        const { data: existingVenueRecord } = await supabase
          .from('venues_with_external_ids')
          .select('id')
          .eq('jambase_venue_id', jamBaseVenue.id)
          .maybeSingle();
        
        let savedVenue;
        if (existingVenueRecord) {
          // Update existing venue
          const { data, error } = await supabase
            .from('venues')
            .update(venueData)
            .eq('id', existingVenueRecord.id)
            .select()
            .single();
          
          if (error) {
            console.error(`❌ Error updating venue ${jamBaseVenue.name}:`, error);
            savedVenue = existingVenueRecord;
          } else {
            savedVenue = data;
            // Ensure external_entity_ids is updated
            try {
              await supabase
                .from('external_entity_ids')
                .upsert({
                  entity_type: 'venue',
                  entity_uuid: savedVenue.id,
                  source: 'jambase',
                  external_id: venueId
                }, { onConflict: 'entity_uuid,source,entity_type' })
                .select();
            } catch {
              // Ignore errors
            }
          }
        } else {
          // Insert new venue
          const { data, error } = await supabase
            .from('venues')
            .insert(venueData)
            .select()
            .single();
          
          if (error) {
            console.error(`❌ Error inserting venue ${jamBaseVenue.name}:`, error);
            savedVenue = null;
          } else {
            savedVenue = data;
            // Insert into external_entity_ids for normalization
            try {
              await supabase
                .from('external_entity_ids')
                .insert({
                  entity_type: 'venue',
                  entity_uuid: savedVenue.id,
                  source: 'jambase',
                  external_id: venueId
                })
                .select();
            } catch {
              // Ignore duplicate errors
            }
          }
        }

        if (!savedVenue) {
          console.error(`❌ Failed to save venue ${jamBaseVenue.name}`);
          continue;
        }

        console.log(`✅ Saved venue ${jamBaseVenue.name} to database`);
        // Transform flat columns back to JSONB format for consistency
        populatedVenues.push({
          ...savedVenue,
          address: {
            streetAddress: savedVenue.address,
            addressLocality: savedVenue.city,
            addressRegion: savedVenue.state,
            postalCode: savedVenue.zip,
            addressCountry: savedVenue.country
          },
          geo: {
            latitude: savedVenue.latitude,
            longitude: savedVenue.longitude
          }
        } as any);
      } catch (error) {
        console.error(`❌ Error processing venue ${jamBaseVenue.name}:`, error);
        // Still add the venue to results even if we can't process it fully
        populatedVenues.push({
          id: jamBaseVenue.id,
          jambase_venue_id: jamBaseVenue.identifier?.split(':')[1] || jamBaseVenue.identifier,
          name: jamBaseVenue.name,
          address: jamBaseVenue.address,
          geo: jamBaseVenue.geo,
          maximum_attendee_capacity: jamBaseVenue.maximumAttendeeCapacity,
          num_upcoming_events: jamBaseVenue['x-numUpcomingEvents'] || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          identifier: jamBaseVenue.identifier,
          last_synced_at: new Date().toISOString()
        } as any);
        continue;
      }
    }

    return populatedVenues;
  }

  /**
   * Get fuzzy matched results from Supabase
   */
  private static async getFuzzyMatchedResults(query: string, limit: number): Promise<VenueSearchResult[]> {
    try {
      const venues = await searchVenuesFuzzy(supabase, query, limit);
      if (venues.length === 0) {
        console.log('📭 No venues found in database');
        return [];
      }

      return venues.map(venue => ({
        id: venue.id,
        name: venue.name,
        identifier: venue.identifier || `manual:${venue.id}`,
        image_url: venue.image_url || undefined,
        address: {
          streetAddress: venue.street_address || undefined,
          addressLocality: venue.city || undefined,
          addressRegion: venue.state || undefined,
        },
        geo:
          venue.latitude != null && venue.longitude != null
            ? { latitude: venue.latitude, longitude: venue.longitude }
            : undefined,
        num_upcoming_events: venue.num_upcoming_events || 0,
        match_score: venue.match_score,
        is_from_database: true,
      }));
    } catch (error) {
      console.error('❌ Error getting fuzzy matched results:', error);
      return [];
    }
  }

  /**
   * Calculate fuzzy match score between query and venue name
   */
  static calculateFuzzyMatchScore(query: string, venueName: string): number {
    return scoreNameMatch(query, venueName);
  }

  /**
   * Get venue suggestions for autocomplete (simplified version)
   */
  static async getVenueSuggestions(query: string, limit: number = 10): Promise<VenueSearchResult[]> {
    return this.searchVenues(query, limit);
  }
}
