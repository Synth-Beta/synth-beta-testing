/**
 * Jambase Sync Service
 * 
 * Optimized sync service that fetches ALL upcoming events, artists, and venues
 * using a single API endpoint with embedded data.
 * 
 * Strategy:
 * - Single endpoint: /jb-api/v1/events with expandExternalIdentifiers=true
 * - Each response includes complete event, artist, and venue data
 * - Batch upsert: artists → venues → events (sequential due to FK constraints)
 * - ~900 API calls for ~90k events (all data included)
 */

import { createClient } from '@supabase/supabase-js';

class JambaseSyncService {
  constructor() {
    // Supabase client with service role for sync operations
    // Use fallback values from repository if env vars not set
    this.supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
    this.supabaseServiceKey = 
      process.env.SUPABASE_SERVICE_ROLE_KEY || 
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
    
    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }
    
    this.supabase = createClient(this.supabaseUrl, this.supabaseServiceKey);
    
    // Jambase API configuration
    // Use fallback value if env var not set
    this.jambaseApiKey = process.env.JAMBASE_API_KEY || process.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
    if (!this.jambaseApiKey) {
      throw new Error('Missing JAMBASE_API_KEY environment variable');
    }
    
    this.baseUrl = 'https://www.jambase.com/jb-api/v1/events';
    
    // Statistics tracking
    this.stats = {
      apiCalls: 0,
      eventsProcessed: 0,
      artistsProcessed: 0,
      venuesProcessed: 0,
      errors: []
    };
  }

  /**
   * Fetch events from Jambase API with pagination
   */
  async fetchEventsPage(page = 1, perPage = 100, dateModifiedFrom = null) {
    const params = new URLSearchParams({
      apikey: this.jambaseApiKey,
      expandExternalIdentifiers: 'true', // CRITICAL: includes all artist/venue IDs
      perPage: perPage.toString(),
      page: page.toString()
    });

    if (dateModifiedFrom) {
      params.append('dateModifiedFrom', dateModifiedFrom);
    }

    const url = `${this.baseUrl}?${params.toString()}`;
    
    this.stats.apiCalls++;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Synth/1.0'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jambase API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Jambase API returned success=false`);
      }

      return {
        events: data.events || [],
        pagination: data.pagination || {},
        totalItems: data.pagination?.totalItems || 0,
        totalPages: data.pagination?.totalPages || 0
      };
    } catch (error) {
      // Retry logic with exponential backoff
      if (this.stats.apiCalls <= 3) {
        const delay = Math.pow(2, this.stats.apiCalls) * 1000; // 2s, 4s, 8s
        console.log(`Retrying API call after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchEventsPage(page, perPage, dateModifiedFrom);
      }
      throw error;
    }
  }

  /**
   * Extract and transform artist data from Jambase performer object
   */
  extractArtistData(performer) {
    if (!performer || !performer.identifier) {
      return null;
    }

    // Remove "jambase:" prefix from identifier
    const jambaseArtistId = performer.identifier.replace(/^jambase:/, '');
    const identifier = performer.identifier; // Full identifier

    return {
      jambase_artist_id: jambaseArtistId,
      artist_data_source: 'jambase',
      name: performer.name || 'Unknown Artist',
      identifier: identifier,
      url: performer.url || null,
      image_url: performer.image || null,
      date_published: performer.datePublished ? new Date(performer.datePublished).toISOString() : null,
      date_modified: performer.dateModified ? new Date(performer.dateModified).toISOString() : null,
      artist_type: performer['@type'] || null, // 'MusicGroup' or 'Person'
      band_or_musician: performer['x-bandOrMusician'] || null, // 'band' or 'musician'
      // Extract founding location - handle object with name or string
      // Note: This field may not be available in embedded performer data from events endpoint
      founding_location: (() => {
        if (!performer.foundingLocation) return null;
        if (typeof performer.foundingLocation === 'string') {
          return performer.foundingLocation;
        }
        if (performer.foundingLocation && typeof performer.foundingLocation === 'object') {
          // Handle object with @type: 'Place' and name property
          if (performer.foundingLocation.name) {
            return performer.foundingLocation.name;
          }
          // Handle object with @type: 'Place' but different structure
          if (performer.foundingLocation['@type'] === 'Place' && performer.foundingLocation.name) {
            return performer.foundingLocation.name;
          }
        }
        return null;
      })(),
      // Extract founding date (usually a year string like "2005" or full date)
      // Note: This field may not be available in embedded performer data from events endpoint
      founding_date: performer.foundingDate || null,
      genres: Array.isArray(performer.genre) ? performer.genre : (performer.genre ? [performer.genre] : null),
      // Extract members - note: field name is 'member' (singular) not 'members' (plural)
      // This field may not be available in embedded performer data from events endpoint
      members: (() => {
        if (!performer.member) return null;
        // Handle both array and single object
        if (Array.isArray(performer.member)) {
          return JSON.parse(JSON.stringify(performer.member));
        }
        // Single member object
        return JSON.parse(JSON.stringify([performer.member]));
      })(),
      member_of: performer.memberOf ? JSON.parse(JSON.stringify(performer.memberOf)) : null, // Deep copy
      external_identifiers: performer['x-externalIdentifiers'] ? JSON.parse(JSON.stringify(performer['x-externalIdentifiers'])) : null,
      same_as: performer.sameAs ? JSON.parse(JSON.stringify(performer.sameAs)) : null,
      num_upcoming_events: 0, // Will be calculated separately
      raw_jambase_data: JSON.parse(JSON.stringify(performer)), // Store complete object
      verified: false,
      last_synced_at: new Date().toISOString()
    };
  }

  /**
   * Extract and transform venue data from Jambase location object
   * Now extracts individual address columns instead of storing in JSONB
   */
  extractVenueData(location) {
    if (!location || !location.name) {
      return null;
    }

    const jambaseVenueId = location.identifier ? location.identifier.replace(/^jambase:/, '') : null;
    const identifier = location.identifier || null;
    const address = location.address || {};

    // Extract street address
    const streetAddress = address.streetAddress || address['x-streetAddress'] || null;

    // Extract state/region - handle string, object with name, or empty object
    let state = null;
    if (address.addressRegion) {
      if (typeof address.addressRegion === 'string') {
        state = address.addressRegion;
      } else if (address.addressRegion && typeof address.addressRegion === 'object') {
        // Check if it's an empty object
        if (Object.keys(address.addressRegion).length > 0 && address.addressRegion.name) {
          state = address.addressRegion.name;
        }
        // If empty object or no name, state remains null
      }
    }

    // Extract country - handle string, object with name/identifier
    let country = null;
    if (address.addressCountry) {
      if (typeof address.addressCountry === 'string') {
        country = address.addressCountry;
      } else if (address.addressCountry && typeof address.addressCountry === 'object') {
        country = address.addressCountry.name || address.addressCountry.identifier || null;
      }
    }

    // Extract postal code
    const zip = address.postalCode || null;

    // Extract latitude and longitude from geo object
    const geo = location.geo || {};
    const latitude = geo.latitude ? parseFloat(geo.latitude) : null;
    const longitude = geo.longitude ? parseFloat(geo.longitude) : null;

    return {
      jambase_venue_id: jambaseVenueId,
      name: location.name,
      identifier: identifier,
      url: location.url || null,
      image_url: location.image || null,
      street_address: streetAddress,
      state: state,
      country: country,
      zip: zip,
      latitude: latitude,
      longitude: longitude,
      geo: location.geo ? JSON.parse(JSON.stringify(location.geo)) : null, // Keep geo JSONB for additional metadata
      maximum_attendee_capacity: location.maximumAttendeeCapacity || null,
      same_as: Array.isArray(location.sameAs) ? location.sameAs : null,
      date_published: location.datePublished ? new Date(location.datePublished).toISOString() : null,
      date_modified: location.dateModified ? new Date(location.dateModified).toISOString() : null,
      num_upcoming_events: 0, // Will be calculated separately
      typical_genres: null, // Will be aggregated from events
      verified: false,
      last_synced_at: new Date().toISOString()
    };
  }

  /**
   * Extract and transform event data from Jambase event object
   */
  extractEventData(jambaseEvent, artistUuid, venueUuid, artistJambaseId = null, venueJambaseId = null) {
    if (!jambaseEvent || !jambaseEvent.identifier) {
      return null;
    }

    // Extract headliner (performer with x-isHeadliner or first performer)
    const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
    const venue = jambaseEvent.location;
    const address = venue?.address;
    const offers = jambaseEvent.offers || [];

    // Remove "jambase:" prefix from identifier
    const jambaseEventId = jambaseEvent.identifier.replace(/^jambase:/, '');

    // Handle doorTime - can be full ISO string or just time
    let doorsTime = null;
    if (jambaseEvent.doorTime) {
      const doorTimeStr = jambaseEvent.doorTime.trim();
      if (doorTimeStr.includes('T') || doorTimeStr.includes('-')) {
        doorsTime = new Date(doorTimeStr).toISOString();
      } else if (jambaseEvent.startDate) {
        // Combine with startDate
        const datePart = jambaseEvent.startDate.split('T')[0];
        doorsTime = new Date(`${datePart}T${doorTimeStr}`).toISOString();
      }
    }

    // Handle addressRegion (can be string, object with name, or empty object)
    let venueState = null;
    if (address?.addressRegion) {
      if (typeof address.addressRegion === 'string') {
        venueState = address.addressRegion;
      } else if (address.addressRegion && typeof address.addressRegion === 'object') {
        // Check if it's an empty object
        if (Object.keys(address.addressRegion).length > 0 && address.addressRegion.name) {
          venueState = address.addressRegion.name;
        }
        // If empty object or no name, venueState remains null
      }
    }

    // Handle price data
    const firstOffer = offers[0];
    const priceSpec = firstOffer?.priceSpecification;
    const ticketAvailable = offers.some(offer => offer.availability === 'InStock');
    
    // Create price_range string
    let priceRange = null;
    if (priceSpec?.minPrice && priceSpec?.maxPrice) {
      priceRange = `$${priceSpec.minPrice} - $${priceSpec.maxPrice}`;
    } else if (priceSpec?.price) {
      priceRange = `$${priceSpec.price}`;
    }

    // Handle images array
    const images = Array.isArray(jambaseEvent.image) 
      ? jambaseEvent.image.map(img => ({ url: img.url, caption: img.caption || null }))
      : null;

    // Extract external URL (first from sameAs array)
    const externalUrl = Array.isArray(jambaseEvent.sameAs) && jambaseEvent.sameAs.length > 0
      ? jambaseEvent.sameAs[0]
      : null;

    // Extract tour name
    const tourName = jambaseEvent.partOfTour?.name || null;

    return {
      jambase_event_id: jambaseEventId,
      title: jambaseEvent.name || `${headliner?.name || 'Unknown Artist'} Live`,
      artist_name: headliner?.name || 'Unknown Artist',
      artist_jambase_id: artistUuid, // FK UUID from artists table
      artist_jambase_id_text: artistJambaseId, // Actual Jambase artist ID (TEXT)
      venue_name: venue?.name || 'Unknown Venue',
      venue_jambase_id: venueUuid, // FK UUID from venues table
      venue_jambase_id_text: venueJambaseId, // Actual Jambase venue ID (TEXT)
      event_date: jambaseEvent.startDate ? new Date(jambaseEvent.startDate).toISOString() : new Date().toISOString(),
      doors_time: doorsTime,
      description: jambaseEvent.description || null,
      genres: Array.isArray(headliner?.genre) ? headliner.genre : (headliner?.genre ? [headliner.genre] : null),
      venue_address: address?.streetAddress || null,
      venue_city: address?.addressLocality || null,
      venue_state: venueState,
      venue_zip: address?.postalCode || null,
      latitude: venue?.geo?.latitude ? parseFloat(venue.geo.latitude) : null,
      longitude: venue?.geo?.longitude ? parseFloat(venue.geo.longitude) : null,
      ticket_available: ticketAvailable,
      price_range: priceRange,
      price_min: priceSpec?.minPrice ? parseFloat(priceSpec.minPrice) : null,
      price_max: priceSpec?.maxPrice ? parseFloat(priceSpec.maxPrice) : null,
      price_currency: priceSpec?.priceCurrency || 'USD',
      ticket_urls: offers.map(offer => offer.url).filter(Boolean),
      external_url: externalUrl,
      setlist: null, // Not available from Jambase API
      tour_name: tourName,
      source: 'jambase',
      event_status: jambaseEvent.eventStatus || null,
      images: images,
      event_media_url: headliner?.image || null, // Artist's image URL as event media
      is_user_created: false,
      is_promoted: false,
      is_featured: false,
      media_urls: [],
      last_modified_at: jambaseEvent.dateModified ? new Date(jambaseEvent.dateModified).toISOString() : null
    };
  }

  /**
   * Batch upsert artists and return UUID mapping
   */
  async upsertArtists(artistsData) {
    if (!artistsData || artistsData.length === 0) {
      return new Map();
    }

    // Deduplicate by jambase_artist_id
    const uniqueArtists = new Map();
    for (const artist of artistsData) {
      if (artist && artist.jambase_artist_id) {
        uniqueArtists.set(artist.jambase_artist_id, artist);
      }
    }

    const artistsArray = Array.from(uniqueArtists.values());

    if (artistsArray.length === 0) {
      return new Map();
    }

    try {
      // Upsert with ON CONFLICT
      const { data, error } = await this.supabase
        .from('artists')
        .upsert(artistsArray, {
          onConflict: 'jambase_artist_id',
          ignoreDuplicates: false
        })
        .select('id, jambase_artist_id');

      if (error) {
        throw error;
      }

      // Create UUID mapping
      const uuidMap = new Map();
      if (data) {
        for (const artist of data) {
          uuidMap.set(artist.jambase_artist_id, artist.id);
        }
      }

      this.stats.artistsProcessed += artistsArray.length;
      return uuidMap;
    } catch (error) {
      console.error('Error upserting artists:', error);
      this.stats.errors.push({ type: 'artists_upsert', error: error.message });
      throw error;
    }
  }

  /**
   * Batch upsert venues and return UUID mapping
   * Note: jambase_venue_id is nullable and not unique, so we use manual upsert logic
   */
  async upsertVenues(venuesData) {
    if (!venuesData || venuesData.length === 0) {
      return new Map();
    }

    // Deduplicate by jambase_venue_id (handle nulls)
    const uniqueVenues = new Map();
    for (const venue of venuesData) {
      if (venue && venue.jambase_venue_id) {
        uniqueVenues.set(venue.jambase_venue_id, venue);
      } else if (venue && venue.name) {
        // Use name as fallback key if no jambase_venue_id
        uniqueVenues.set(`name:${venue.name}`, venue);
      }
    }

    const venuesArray = Array.from(uniqueVenues.values());

    if (venuesArray.length === 0) {
      return new Map();
    }

    try {
      // Since jambase_venue_id is not unique, we need to manually check and upsert
      const uuidMap = new Map();
      
      for (const venue of venuesArray) {
        let venueId = null;
        
          if (venue.jambase_venue_id) {
          // Check if venue exists by jambase_venue_id
          const { data: existing } = await this.supabase
            .from('venues')
            .select('id')
            .eq('jambase_venue_id', venue.jambase_venue_id)
            .maybeSingle();
          
          if (existing) {
            // Update existing venue
            const { data: updated, error: updateError } = await this.supabase
              .from('venues')
              .update(venue)
              .eq('id', existing.id)
              .select('id')
              .single();
            
            if (updateError) throw updateError;
            venueId = updated.id;
          } else {
            // Insert new venue
            const { data: inserted, error: insertError } = await this.supabase
              .from('venues')
              .insert(venue)
              .select('id')
              .single();
            
            if (insertError) throw insertError;
            venueId = inserted.id;
          }
          
          uuidMap.set(venue.jambase_venue_id, venueId);
        } else {
          // No jambase_venue_id, use name-based lookup
          const { data: existing } = await this.supabase
            .from('venues')
            .select('id')
            .eq('name', venue.name)
            .is('jambase_venue_id', null)
            .maybeSingle();
          
          if (existing) {
            // Update existing venue
            const { data: updated, error: updateError } = await this.supabase
              .from('venues')
              .update(venue)
              .eq('id', existing.id)
              .select('id')
              .single();
            
            if (updateError) throw updateError;
            venueId = updated.id;
          } else {
            // Insert new venue
            const { data: inserted, error: insertError } = await this.supabase
              .from('venues')
              .insert(venue)
              .select('id')
              .single();
            
            if (insertError) throw insertError;
            venueId = inserted.id;
          }
          
          uuidMap.set(`name:${venue.name}`, venueId);
        }
      }

      this.stats.venuesProcessed += venuesArray.length;
      return uuidMap;
    } catch (error) {
      console.error('Error upserting venues:', error);
      this.stats.errors.push({ type: 'venues_upsert', error: error.message });
      throw error;
    }
  }

  /**
   * Batch upsert events
   */
  async upsertEvents(eventsData) {
    if (!eventsData || eventsData.length === 0) {
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('events')
        .upsert(eventsData, {
          onConflict: 'jambase_event_id',
          ignoreDuplicates: false
        })
        .select('id, jambase_event_id');

      if (error) {
        throw error;
      }

      this.stats.eventsProcessed += eventsData.length;
    } catch (error) {
      console.error('Error upserting events:', error);
      this.stats.errors.push({ type: 'events_upsert', error: error.message });
      throw error;
    }
  }

  /**
   * Process a single page of events (100 events)
   * Returns: { artistsProcessed, venuesProcessed, eventsProcessed }
   */
  async processPage(jambaseEvents) {
    const artistsData = [];
    const venuesData = [];
    const eventsData = [];

    // Step 1: Extract all artist and venue data
    for (const jambaseEvent of jambaseEvents) {
      // Extract headliner
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      if (headliner) {
        const artistData = this.extractArtistData(headliner);
        if (artistData) {
          artistsData.push(artistData);
        }
      }

      // Extract venue
      if (jambaseEvent.location) {
        const venueData = this.extractVenueData(jambaseEvent.location);
        if (venueData) {
          venuesData.push(venueData);
        }
      }
    }

    // Step 2: Upsert artists and get UUID mapping
    const artistUuidMap = await this.upsertArtists(artistsData);

    // Step 3: Upsert venues and get UUID mapping
    const venueUuidMap = await this.upsertVenues(venuesData);

    // Step 4: Extract event data with FK UUIDs
    for (const jambaseEvent of jambaseEvents) {
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      const venue = jambaseEvent.location;

      // Get UUIDs from maps
      const jambaseArtistId = headliner?.identifier?.replace(/^jambase:/, '');
      const jambaseVenueId = venue?.identifier?.replace(/^jambase:/, '');
      
      const artistUuid = jambaseArtistId ? artistUuidMap.get(jambaseArtistId) : null;
      const venueUuid = jambaseVenueId ? venueUuidMap.get(jambaseVenueId) : null;

      const eventData = this.extractEventData(jambaseEvent, artistUuid, venueUuid, jambaseArtistId, jambaseVenueId);
      if (eventData) {
        eventsData.push(eventData);
      }
    }

    // Step 5: Upsert events
    await this.upsertEvents(eventsData);

    return {
      artistsProcessed: artistsData.length,
      venuesProcessed: venuesData.length,
      eventsProcessed: eventsData.length
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      apiCalls: 0,
      eventsProcessed: 0,
      artistsProcessed: 0,
      venuesProcessed: 0,
      errors: []
    };
  }
}

export default JambaseSyncService;

